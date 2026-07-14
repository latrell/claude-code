// Lock file whose mtime IS lastConsolidatedAt. New-format bodies include a
// unique owner token as well as the holder PID. Legacy PID-only bodies remain
// readable for upgrades from older versions.
//
// Lives inside the memory dir (getAutoMemPath) so it keys on git-root
// like memory does, and so it's writable even when the memory path comes
// from an env/settings override whose parent may not be.

import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { getOriginalCwd } from '../../bootstrap/state.js'
import { getAutoMemPath } from '../../memdir/paths.js'
import { logForDebugging } from '../../utils/debug.js'
import { isProcessRunning } from '../../utils/genericProcessUtils.js'
import { listCandidates } from '../../utils/listSessionsImpl.js'
import { getProjectDir } from '../../utils/sessionStorage.js'
import { randomUUID } from '../../utils/crypto.js'

const LOCK_FILE = '.consolidate-lock'
const LOCK_VERSION = 1

// Stale past this even if the PID is live (PID reuse guard).
const HOLDER_STALE_MS = 60 * 60 * 1000

function lockPath(): string {
  return join(getAutoMemPath(), LOCK_FILE)
}

export type ConsolidationLockLease = Readonly<{
  priorMtime: number
  ownerToken: string
}>

type LockRecord = {
  version: typeof LOCK_VERSION
  pid: number
  ownerToken: string
  priorMtime: number
}

type LockSnapshot = {
  mtimeMs: number
  effectiveMtimeMs: number
  holderPid: number | undefined
  ownerToken: string | undefined
  rolledBack: boolean
}

function rollbackPath(ownerToken: string): string {
  return join(getAutoMemPath(), `${LOCK_FILE}.rollback-${ownerToken}`)
}

function parseLockRecord(raw: string): {
  holderPid: number | undefined
  ownerToken: string | undefined
  priorMtime: number | undefined
} {
  try {
    const candidate = JSON.parse(raw) as Record<string, unknown>
    if (
      candidate.version === LOCK_VERSION &&
      typeof candidate.pid === 'number' &&
      Number.isSafeInteger(candidate.pid) &&
      candidate.pid > 0 &&
      typeof candidate.ownerToken === 'string' &&
      /^[0-9a-f-]{36}$/i.test(candidate.ownerToken) &&
      typeof candidate.priorMtime === 'number' &&
      Number.isFinite(candidate.priorMtime) &&
      candidate.priorMtime >= 0
    ) {
      return {
        holderPid: candidate.pid,
        ownerToken: candidate.ownerToken,
        priorMtime: candidate.priorMtime,
      }
    }
  } catch {
    // Fall through to the legacy PID-only representation.
  }

  const legacyPid = parseInt(raw.trim(), 10)
  return {
    holderPid: Number.isFinite(legacyPid) ? legacyPid : undefined,
    ownerToken: undefined,
    priorMtime: undefined,
  }
}

async function markerExists(ownerToken: string): Promise<boolean> {
  try {
    await stat(rollbackPath(ownerToken))
    return true
  } catch {
    return false
  }
}

async function readLockSnapshot(): Promise<LockSnapshot | null> {
  try {
    const path = lockPath()
    const [s, raw] = await Promise.all([stat(path), readFile(path, 'utf8')])
    const parsed = parseLockRecord(raw)
    const rolledBack = parsed.ownerToken
      ? await markerExists(parsed.ownerToken)
      : false
    return {
      mtimeMs: s.mtimeMs,
      effectiveMtimeMs:
        rolledBack && parsed.priorMtime !== undefined
          ? parsed.priorMtime
          : s.mtimeMs,
      holderPid: parsed.holderPid,
      ownerToken: parsed.ownerToken,
      rolledBack,
    }
  } catch {
    return null
  }
}

/**
 * Effective lock timestamp = lastConsolidatedAt. 0 if absent. A rollback
 * marker makes the current owner's pre-acquire timestamp effective again.
 */
export async function readLastConsolidatedAt(): Promise<number> {
  return (await readLockSnapshot())?.effectiveMtimeMs ?? 0
}

/**
 * Acquire: write PID + owner token → mtime = now. Returns an owner-scoped
 * lease containing the pre-acquire mtime, or null if blocked / lost a race.
 *
 *   Success → do nothing. mtime stays at now.
 *   Failure → rollbackConsolidationLock(lease) publishes a token-scoped
 *             rollback marker. It never mutates a later owner's lock.
 *   Crash   → mtime stuck, dead PID → next process reclaims.
 */
export async function tryAcquireConsolidationLock(): Promise<ConsolidationLockLease | null> {
  const path = lockPath()
  const snapshot = await readLockSnapshot()

  if (
    snapshot !== null &&
    !snapshot.rolledBack &&
    Date.now() - snapshot.mtimeMs < HOLDER_STALE_MS
  ) {
    if (
      snapshot.holderPid !== undefined &&
      isProcessRunning(snapshot.holderPid)
    ) {
      logForDebugging(
        `[autoDream] lock held by live PID ${snapshot.holderPid} (mtime ${Math.round((Date.now() - snapshot.mtimeMs) / 1000)}s ago)`,
      )
      return null
    }
    // Dead PID or unparseable body — reclaim.
  }

  // Memory dir may not exist yet.
  await mkdir(getAutoMemPath(), { recursive: true })
  const lease: ConsolidationLockLease = {
    priorMtime: snapshot?.effectiveMtimeMs ?? 0,
    ownerToken: randomUUID(),
  }
  const record: LockRecord = {
    version: LOCK_VERSION,
    pid: process.pid,
    ownerToken: lease.ownerToken,
    priorMtime: lease.priorMtime,
  }
  await writeFile(path, JSON.stringify(record))

  // Two reclaimers both write → last wins the token. Loser bails on re-read.
  let verify: string
  try {
    verify = await readFile(path, 'utf8')
  } catch {
    return null
  }
  if (parseLockRecord(verify).ownerToken !== lease.ownerToken) return null

  // The previous owner's rollback marker is no longer consulted after our
  // token is installed. Remove the usual marker to avoid unbounded buildup;
  // a genuinely late old rollback may recreate it, but remains harmless.
  if (snapshot?.rolledBack && snapshot.ownerToken) {
    try {
      await unlink(rollbackPath(snapshot.ownerToken))
    } catch {
      // Best-effort garbage collection only.
    }
  }

  return lease
}

/**
 * Release a failed acquisition by publishing an owner-scoped marker. Readers
 * only honor the marker whose token is in the current lock record, so even a
 * delayed or duplicate rollback from an old task cannot delete, rewind, or
 * otherwise release a lock that has since been reclaimed by a new owner.
 */
export async function rollbackConsolidationLock(
  lease: ConsolidationLockLease,
): Promise<void> {
  try {
    await mkdir(getAutoMemPath(), { recursive: true })
    await writeFile(
      rollbackPath(lease.ownerToken),
      JSON.stringify({ priorMtime: lease.priorMtime }),
    )
  } catch (e: unknown) {
    logForDebugging(
      `[autoDream] rollback failed: ${(e as Error).message} — next trigger delayed to minHours`,
    )
  }
}

/**
 * Session IDs with mtime after sinceMs. listCandidates handles UUID
 * validation (excludes agent-*.jsonl) and parallel stat.
 *
 * Uses mtime (sessions TOUCHED since), not birthtime (0 on ext4).
 * Caller excludes the current session. Scans per-cwd transcripts — it's
 * a skip-gate, so undercounting worktree sessions is safe.
 */
export async function listSessionsTouchedSince(
  sinceMs: number,
): Promise<string[]> {
  const dir = getProjectDir(getOriginalCwd())
  const candidates = await listCandidates(dir, true)
  return candidates.filter(c => c.mtime > sinceMs).map(c => c.sessionId)
}

/**
 * Stamp from manual /dream. Optimistic — fires at prompt-build time,
 * no post-skill completion hook. Best-effort.
 */
export async function recordConsolidation(): Promise<void> {
  try {
    // Memory dir may not exist yet (manual /dream before any auto-trigger).
    await mkdir(getAutoMemPath(), { recursive: true })
    await writeFile(lockPath(), String(process.pid))
  } catch (e: unknown) {
    logForDebugging(
      `[autoDream] recordConsolidation write failed: ${(e as Error).message}`,
    )
  }
}
