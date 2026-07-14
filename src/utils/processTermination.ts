import treeKill from 'tree-kill'
import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'

export type TerminationSignal = 'SIGTERM' | 'SIGKILL'

export interface ProcessTreeOptions {
  /**
   * The process was spawned as a detached POSIX process-group leader. Using
   * the negative PID is both faster and safer than rediscovering descendants
   * after the leader has started exiting.
   */
  isolatedProcessGroup?: boolean
}

function isMissingProcessError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as Error & { code?: string }).code === 'ESRCH'
  )
}

/** Signal a process and all of its descendants. */
export async function signalProcessTree(
  pid: number,
  signal: TerminationSignal,
  options: ProcessTreeOptions = {},
): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`Invalid process id: ${pid}`)
  }

  if (process.platform !== 'win32' && options.isolatedProcessGroup) {
    try {
      process.kill(-pid, signal)
    } catch (error) {
      if (!isMissingProcessError(error)) throw error
    }
    return
  }

  await new Promise<void>((resolve, reject) => {
    treeKill(pid, signal, error => {
      if (!error || isMissingProcessError(error)) {
        resolve()
        return
      }
      reject(error)
    })
  })
}

/** Check the root PID or its isolated POSIX process group for liveness. */
export function isProcessTreeAlive(
  pid: number,
  options: ProcessTreeOptions = {},
): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false

  const target =
    process.platform !== 'win32' && options.isolatedProcessGroup ? -pid : pid
  try {
    process.kill(target, 0)
    return true
  } catch (error) {
    // EPERM means the process exists but cannot be signalled by this user.
    return (
      error instanceof Error &&
      'code' in error &&
      (error as Error & { code?: string }).code === 'EPERM'
    )
  }
}

export interface TerminationPolicy {
  signal: (signal: TerminationSignal) => Promise<void>
  waitForExit: (timeoutMs: number) => Promise<boolean>
  graceMs: number
  forceWaitMs: number
  signalTimeoutMs?: number
  onSignalError?: (signal: TerminationSignal, error: unknown) => void
}

export interface TerminateProcessTreeOptions extends ProcessTreeOptions {
  graceMs?: number
  forceWaitMs?: number
  signalTimeoutMs?: number
  onSignal?: (signal: TerminationSignal) => void
  onSignalError?: (signal: TerminationSignal, error: unknown) => void
  /** Test/runtime seam for process enumeration and signalling. */
  runtime?: ProcessTreeRuntime
}

export interface ProcessTreeRuntime {
  /** Atomically-enough captures the root and descendants with start identity. */
  snapshotTree: (pid: number) => Promise<readonly ProcessIdentity[]>
  /** Returns only members whose PID still has the captured start identity. */
  inspectLive: (
    identities: readonly ProcessIdentity[],
  ) => Promise<readonly ProcessIdentity[]>
  /** Must validate identity again immediately before signalling. */
  signalTree: (
    identity: ProcessIdentity,
    signal: TerminationSignal,
  ) => Promise<void>
}

export type ProcessIdentity = {
  pid: number
  startedAt: string
}

type ProcessTableRow = ProcessIdentity & { parentPid: number }

function execFileText(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 5_000 },
      (error, stdout) => {
        if (error) {
          reject(error)
          return
        }
        resolve(stdout)
      },
    )
  })
}

function collectProcessTree(
  rootPid: number,
  rows: readonly ProcessTableRow[],
): readonly ProcessIdentity[] {
  const byPid = new Map(rows.map(row => [row.pid, row]))
  const root = byPid.get(rootPid)
  if (!root) return []

  const byParent = new Map<number, ProcessTableRow[]>()
  for (const row of rows) {
    const children = byParent.get(row.parentPid) ?? []
    children.push(row)
    byParent.set(row.parentPid, children)
  }

  const identities = new Map<number, ProcessIdentity>([[root.pid, root]])
  const pending = [...(byParent.get(rootPid) ?? [])]
  while (pending.length > 0) {
    const row = pending.pop()!
    if (identities.has(row.pid)) continue
    identities.set(row.pid, row)
    pending.push(...(byParent.get(row.pid) ?? []))
  }
  return [...identities.values()]
}

async function readLinuxProcessTable(): Promise<ProcessTableRow[]> {
  const entries = await readdir('/proc', { withFileTypes: true })
  const rows = await Promise.all(
    entries
      .filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map(async entry => {
        try {
          const stat = await readFile(`/proc/${entry.name}/stat`, 'utf8')
          // comm is parenthesized and may contain spaces or ')', so split only
          // after its final closing parenthesis. The remaining fields start at
          // field 3 (state); ppid is field 4 and starttime is field 22.
          const closeParen = stat.lastIndexOf(')')
          if (closeParen < 0) return null
          const fields = stat
            .slice(closeParen + 2)
            .trim()
            .split(/\s+/)
          const pid = Number(entry.name)
          const parentPid = Number(fields[1])
          const startedAt = fields[19]
          if (!Number.isInteger(parentPid) || !startedAt) return null
          return { pid, parentPid, startedAt }
        } catch {
          // Processes can exit while /proc is being enumerated.
          return null
        }
      }),
  )
  return rows.filter((row): row is ProcessTableRow => row !== null)
}

async function readProcessTable(): Promise<ProcessTableRow[]> {
  if (process.platform === 'linux') return readLinuxProcessTable()

  const output =
    process.platform === 'win32'
      ? await execFileText('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "$all = Get-CimInstance Win32_Process -ErrorAction Stop; foreach ($p in $all) { try { $ticks = $p.CreationDate.ToFileTimeUtc(); [Console]::Out.WriteLine(('{0} {1} {2}' -f $p.ProcessId, $p.ParentProcessId, ($ticks - ($ticks % 10)))) } catch { exit 2 } }",
        ])
      : await execFileText('ps', ['-A', '-o', 'pid=,ppid=,lstart='])

  return output
    .split(/\r?\n/)
    .map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map(match => ({
      pid: Number(match[1]),
      parentPid: Number(match[2]),
      startedAt: match[3]!.trim(),
    }))
}

const defaultProcessTreeRuntime: ProcessTreeRuntime = {
  snapshotTree: async pid => collectProcessTree(pid, await readProcessTable()),
  inspectLive: async identities => {
    const current = new Map(
      (await readProcessTable()).map(row => [row.pid, row.startedAt]),
    )
    return identities.filter(
      identity => current.get(identity.pid) === identity.startedAt,
    )
  },
  signalTree: async (identity, signal) => {
    const live = await defaultProcessTreeRuntime.inspectLive([identity])
    if (live.length === 0) return
    await signalProcessTree(identity.pid, signal)
  },
}

async function deliverSignal(
  policy: TerminationPolicy,
  signal: TerminationSignal,
): Promise<void> {
  const timeoutMs = policy.signalTimeoutMs ?? 5_000
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      policy.signal(signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${signal} delivery timed out`)),
          timeoutMs,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Apply TERM -> bounded wait -> KILL -> bounded confirmation. The result is
 * true only after waitForExit confirms the process tree is gone.
 */
export async function terminateWithEscalation(
  policy: TerminationPolicy,
): Promise<boolean> {
  try {
    await deliverSignal(policy, 'SIGTERM')
  } catch (error) {
    policy.onSignalError?.('SIGTERM', error)
  }

  if (await policy.waitForExit(policy.graceMs)) return true

  try {
    await deliverSignal(policy, 'SIGKILL')
  } catch (error) {
    policy.onSignalError?.('SIGKILL', error)
  }

  return policy.waitForExit(policy.forceWaitMs)
}

/**
 * Terminate a PID and every identity-snapshotted descendant, then confirm all
 * original process identities are gone. A false result is an explicit
 * failure to prove termination, never a successful cleanup.
 */
export async function terminateProcessTree(
  pid: number,
  options: TerminateProcessTreeOptions = {},
): Promise<boolean> {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`Invalid process id: ${pid}`)
  }

  const processTreeOptions: ProcessTreeOptions = {
    isolatedProcessGroup: options.isolatedProcessGroup,
  }
  const runtime = options.runtime ?? defaultProcessTreeRuntime
  const tracked = new Map<number, ProcessIdentity>()
  let snapshotConfirmed = true

  const inspectLive = async (
    identities: readonly ProcessIdentity[],
  ): Promise<readonly ProcessIdentity[]> => {
    try {
      return await runtime.inspectLive(identities)
    } catch {
      snapshotConfirmed = false
      return []
    }
  }

  const addTrees = async (roots: readonly ProcessIdentity[]): Promise<void> => {
    const stillLiveRoots = await inspectLive(roots)
    const snapshots = await Promise.allSettled(
      stillLiveRoots.map(root => runtime.snapshotTree(root.pid)),
    )
    for (let index = 0; index < snapshots.length; index++) {
      const snapshot = snapshots[index]!
      const expectedRoot = stillLiveRoots[index]!
      if (snapshot.status === 'rejected') {
        // Still dispatch best-effort termination, but never return true when
        // we could not establish which descendants must be observed.
        snapshotConfirmed = false
        continue
      }
      const capturedRoot = snapshot.value.find(
        identity => identity.pid === expectedRoot.pid,
      )
      if (!capturedRoot || capturedRoot.startedAt !== expectedRoot.startedAt) {
        // The PID disappeared or was reused during the snapshot. Never attach
        // the replacement's descendants to the original execution tree.
        snapshotConfirmed = false
        continue
      }
      for (const identity of snapshot.value) {
        const previous = tracked.get(identity.pid)
        if (previous && previous.startedAt !== identity.startedAt) {
          snapshotConfirmed = false
          continue
        }
        tracked.set(identity.pid, identity)
      }
    }
  }

  const waitForTreeExit = async (timeoutMs: number): Promise<boolean> => {
    const deadline = Date.now() + Math.max(0, timeoutMs)
    while (true) {
      const live = await inspectLive([...tracked.values()])
      if (snapshotConfirmed && live.length === 0) return true
      if (Date.now() >= deadline) return false
      await new Promise<void>(resolve => {
        setTimeout(resolve, Math.min(50, deadline - Date.now()))
      })
    }
  }

  const signalLiveMembers = async (
    signal: TerminationSignal,
  ): Promise<void> => {
    const live = await inspectLive([...tracked.values()])
    // Signal every identity-validated member. This intentionally duplicates
    // descendant delivery while the root is live, but also reaches a captured
    // child that re-parented before tree-kill enumerates the current tree.
    const targets = live
    const deliveries = targets.map(identity =>
      runtime.signalTree(identity, signal),
    )
    if (process.platform !== 'win32' && options.isolatedProcessGroup) {
      // Group delivery reaches children created after the snapshot; explicit
      // identity targets cover descendants that moved into nested/new groups.
      deliveries.unshift(signalProcessTree(pid, signal, processTreeOptions))
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const results = await Promise.race([
      Promise.allSettled(deliveries),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${signal} tree delivery timed out`)),
          options.signalTimeoutMs ?? 5_000,
        )
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer)
    })
    const failures = results.flatMap(result =>
      result.status === 'rejected' ? [result.reason] : [],
    )
    if (failures.length > 0) {
      throw new Error(
        `Failed to deliver ${signal} to ${failures.length} process tree member(s)`,
      )
    }
  }

  // Snapshot root identity and all descendants before TERM. Without this,
  // root-first exit can hide orphans and PID reuse can target unrelated work.
  let initialTree: readonly ProcessIdentity[]
  try {
    initialTree = await runtime.snapshotTree(pid)
  } catch {
    initialTree = []
  }
  const rootIdentity = initialTree.find(identity => identity.pid === pid)
  if (!rootIdentity) {
    // Enumeration failed, so no successful proof is possible. Still make a
    // bounded best-effort attempt to stop the supplied tree; callers retain
    // tracking because this path always returns false.
    for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
      options.onSignal?.(signal)
      try {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([
            signalProcessTree(pid, signal, processTreeOptions),
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(
                () => reject(new Error(`${signal} tree delivery timed out`)),
                options.signalTimeoutMs ?? 5_000,
              )
            }),
          ])
        } finally {
          if (timer) clearTimeout(timer)
        }
      } catch (error) {
        options.onSignalError?.(signal, error)
      }
      if (signal === 'SIGTERM' && (options.graceMs ?? 500) > 0) {
        await new Promise<void>(resolve => {
          setTimeout(resolve, options.graceMs ?? 500)
        })
      }
    }
    return false
  }
  for (const identity of initialTree) tracked.set(identity.pid, identity)

  try {
    // Refresh once while the captured root identity is still live, closing the
    // small snapshot-to-signal window for newly-created children.
    await addTrees([rootIdentity])
    options.onSignal?.('SIGTERM')
    await signalLiveMembers('SIGTERM')
  } catch (error) {
    options.onSignalError?.('SIGTERM', error)
  }

  if (await waitForTreeExit(options.graceMs ?? 500)) return true

  const survivors = await inspectLive([...tracked.values()])
  await addTrees(survivors)
  try {
    options.onSignal?.('SIGKILL')
    await signalLiveMembers('SIGKILL')
  } catch (error) {
    options.onSignalError?.('SIGKILL', error)
  }

  return waitForTreeExit(options.forceWaitMs ?? 500)
}

/** Poll a condition without resolving early after the final signal. */
export async function waitForTermination(
  isTerminated: () => boolean,
  timeoutMs: number,
  pollIntervalMs = 50,
): Promise<boolean> {
  if (isTerminated()) return true

  const deadline = Date.now() + Math.max(0, timeoutMs)
  while (Date.now() < deadline) {
    await new Promise<void>(resolve => {
      setTimeout(resolve, Math.min(pollIntervalMs, deadline - Date.now()))
    })
    if (isTerminated()) return true
  }

  return isTerminated()
}
