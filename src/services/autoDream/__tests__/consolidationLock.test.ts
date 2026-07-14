import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

type ProbeResult = {
  currentRollback: {
    before: number
    after: number
    leaseToken: string
    recordToken: string
  }
  staleRollback: {
    oldToken: string
    newToken: string
    before: number
    after: number
    recordToken: string
  }
}

const tempDir = await mkdtemp(join(tmpdir(), 'auto-dream-lock-'))
let probe: ProbeResult

// Run the real lock module in an isolated Bun process. This avoids global
// module mocks or memory-path environment changes leaking into other test
// files while still exercising the actual filesystem protocol end-to-end.
beforeAll(async () => {
  const script = `
    import { mock } from 'bun:test'
    import { mkdir, readFile, rm, utimes } from 'fs/promises'
    import { join } from 'path'

    const memoryDir = process.env.CLAUDE_COWORK_MEMORY_PATH_OVERRIDE
    if (!memoryDir) throw new Error('missing memory directory')
    mock.module('src/bootstrap/state.ts', () => ({
      getOriginalCwd: () => memoryDir,
    }))
    mock.module('src/memdir/paths.ts', () => ({
      getAutoMemPath: () => memoryDir,
    }))
    mock.module('src/utils/debug.ts', () => ({
      logForDebugging: () => {},
    }))
    mock.module('src/utils/genericProcessUtils.ts', () => ({
      isProcessRunning: () => true,
    }))
    mock.module('src/utils/listSessionsImpl.ts', () => ({
      listCandidates: () => Promise.resolve([]),
    }))
    mock.module('src/utils/sessionStorage.ts', () => ({
      getProjectDir: () => memoryDir,
    }))
    const lockPath = join(memoryDir, '.consolidate-lock')
    const lock = await import('./src/services/autoDream/consolidationLock.ts')

    const currentLease = await lock.tryAcquireConsolidationLock()
    if (!currentLease) throw new Error('failed to acquire current lease')
    const currentBefore = await lock.readLastConsolidatedAt()
    await lock.rollbackConsolidationLock(currentLease)
    const currentAfter = await lock.readLastConsolidatedAt()
    const currentRecord = JSON.parse(await readFile(lockPath, 'utf8'))

    await rm(memoryDir, { recursive: true, force: true })
    await mkdir(memoryDir, { recursive: true })

    const oldLease = await lock.tryAcquireConsolidationLock()
    if (!oldLease) throw new Error('failed to acquire old lease')
    const staleSeconds = (Date.now() - 2 * 60 * 60 * 1000) / 1000
    await utimes(lockPath, staleSeconds, staleSeconds)
    const newLease = await lock.tryAcquireConsolidationLock()
    if (!newLease) throw new Error('failed to reclaim stale lease')
    const staleBefore = await lock.readLastConsolidatedAt()
    await lock.rollbackConsolidationLock(oldLease)
    const staleAfter = await lock.readLastConsolidatedAt()
    const staleRecord = JSON.parse(await readFile(lockPath, 'utf8'))

    console.log(JSON.stringify({
      currentRollback: {
        before: currentBefore,
        after: currentAfter,
        leaseToken: currentLease.ownerToken,
        recordToken: currentRecord.ownerToken,
      },
      staleRollback: {
        oldToken: oldLease.ownerToken,
        newToken: newLease.ownerToken,
        before: staleBefore,
        after: staleAfter,
        recordToken: staleRecord.ownerToken,
      },
    }))
    process.exit(0)
  `
  const child = Bun.spawn([process.execPath, '-e', script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLAUDE_COWORK_MEMORY_PATH_OVERRIDE: tempDir,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(`lock probe failed (${exitCode}): ${stderr}`)
  }
  probe = JSON.parse(stdout.trim()) as ProbeResult
}, 20_000)

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('consolidation lock ownership', () => {
  test('a rollback releases its current owner without mutating the lock file', () => {
    expect(probe.currentRollback.before).toBeGreaterThan(0)
    expect(probe.currentRollback.after).toBe(0)
    expect(probe.currentRollback.recordToken).toBe(
      probe.currentRollback.leaseToken,
    )
  })

  test('a late old-owner rollback cannot release a reclaimed lock', () => {
    expect(probe.staleRollback.newToken).not.toBe(probe.staleRollback.oldToken)
    expect(probe.staleRollback.after).toBe(probe.staleRollback.before)
    expect(probe.staleRollback.recordToken).toBe(probe.staleRollback.newToken)
  })
})
