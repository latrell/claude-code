import { mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, afterEach, describe, expect, test } from 'bun:test'
import { formatDuration } from '../../../format.js'
import { WindowsTerminalBackend } from '../WindowsTerminalBackend'

type Call = { command: string; args: string[] }

const ROOT_START_TIME = '133700000000000000'
const ROOT_IDENTITY = `54321|${ROOT_START_TIME}`

let tempDir: string

beforeEach(async () => {
  tempDir = join(
    tmpdir(),
    `windows-terminal-backend-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  await mkdir(tempDir, { recursive: true })
  process.env.CLAUDE_WT_PANE_TIMEOUT_MS = '2000'
  process.env.CLAUDE_WT_KILL_TIMEOUT_MS = '100'
  process.env.CLAUDE_WT_KILL_COMMAND_TIMEOUT_MS = '100'
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
  delete process.env.CLAUDE_WT_PANE_TIMEOUT_MS
  delete process.env.CLAUDE_WT_KILL_TIMEOUT_MS
  delete process.env.CLAUDE_WT_KILL_COMMAND_TIMEOUT_MS
})

function getPowerShellScript(args: string[]): string {
  const commandIndex = args.indexOf('-Command')
  return commandIndex >= 0 ? (args[commandIndex + 1] ?? '') : ''
}

function processInspectionResult(
  args: string[],
  liveIdentities: string[],
): { stdout: string; stderr: string; code: number } {
  const script = getPowerShellScript(args)
  if (script.includes('$expected = @(')) {
    return { stdout: liveIdentities.join('\n'), stderr: '', code: 0 }
  }
  if (script.includes('Get-CimInstance Win32_Process')) {
    return { stdout: liveIdentities.join('\n'), stderr: '', code: 0 }
  }
  const pidMatch = /Get-Process -Id (\d+)/.exec(script)
  if (pidMatch) {
    const prefix = `${pidMatch[1]}|`
    const identity = liveIdentities.find(value => value.startsWith(prefix))
    return {
      stdout: identity?.slice(prefix.length) ?? 'MISSING',
      stderr: '',
      code: 0,
    }
  }
  return { stdout: '', stderr: 'unexpected PowerShell command', code: 1 }
}

function createBackend(
  calls: Call[],
  opts: { simulatePidWrite?: boolean | number } = {},
): WindowsTerminalBackend {
  const simulate = opts.simulatePidWrite !== false
  const delayMs =
    typeof opts.simulatePidWrite === 'number' ? opts.simulatePidWrite : 30
  let liveIdentities = [ROOT_IDENTITY]
  return new WindowsTerminalBackend({
    runCommand: async (command, args) => {
      calls.push({ command, args })
      if (simulate && command === 'wt.exe') {
        const encIdx = args.indexOf('-EncodedCommand')
        if (encIdx >= 0) {
          const decoded = Buffer.from(args[encIdx + 1]!, 'base64').toString(
            'utf16le',
          )
          const match = decoded.match(/Set-Content -LiteralPath '([^']+)'/)
          if (match) {
            setTimeout(() => {
              writeFile(match[1]!, ROOT_IDENTITY, 'utf-8').catch(() => {})
            }, delayMs)
          }
        }
      }
      if (command === 'powershell.exe') {
        return processInspectionResult(args, liveIdentities)
      }
      if (command === 'taskkill.exe') {
        liveIdentities = []
      }
      return { stdout: 'ok', stderr: '', code: 0 }
    },
    getPlatform: () => 'windows',
    pidFileDir: tempDir,
  })
}

function decodeEncodedCommand(call: Call): {
  args: string[]
  decodedLauncher: string
} {
  expect(call.command).toBe('wt.exe')
  const encIdx = call.args.indexOf('-EncodedCommand')
  expect(encIdx).toBeGreaterThanOrEqual(0)
  const encoded = call.args[encIdx + 1]!
  const decodedLauncher = Buffer.from(encoded, 'base64').toString('utf16le')
  return { args: call.args, decodedLauncher }
}

describe('WindowsTerminalBackend', () => {
  test('launches split panes through wt.exe with a wrapped PowerShell command', async () => {
    const calls: Call[] = []
    const backend = createBackend(calls)
    const pane = await backend.createTeammatePaneInSwarmView('worker', 'blue')

    await backend.sendCommandToPane(
      pane.paneId,
      "Set-Location -LiteralPath 'C:\\repo'; & 'claude.exe' '--agent-id' 'worker@alpha'",
    )

    expect(calls).toHaveLength(1)
    const { args, decodedLauncher } = decodeEncodedCommand(calls[0]!)
    expect(args).toContain('split-pane')
    expect(args).toContain('--vertical')
    expect(args).toContain('--title')
    expect(args).toContain('worker')
    expect(decodedLauncher).toContain('Set-Content -LiteralPath')
    expect(decodedLauncher).toContain('claude.exe')
  })

  test('preserves use_splitpane false as a separate Windows Terminal window', async () => {
    const calls: Call[] = []
    const backend = createBackend(calls)
    const pane = await backend.createTeammateWindowInSwarmView(
      'reviewer',
      'cyan',
    )

    await backend.sendCommandToPane(pane.paneId, "Write-Output 'hello'")

    expect(pane.windowName).toBe('teammate-reviewer')
    const { args } = decodeEncodedCommand(calls[0]!)
    expect(args.join(' ')).toContain('-w -1 new-tab --title')
  })

  test('kills the cached pid process tree and confirms exit', async () => {
    const calls: Call[] = []
    const backend = createBackend(calls)
    const pane = await backend.createTeammatePaneInSwarmView('killer', 'red')

    // sendCommandToPane resolves — simulate writes '54321' to pidFile, which
    // becomes pane.pid. killPane should use the cached pid, not re-read the file.
    await backend.sendCommandToPane(pane.paneId, "Write-Output 'running'")

    const killed = await backend.killPane(pane.paneId)

    expect(killed).toBe(true)
    const killCall = calls.find(call => call.command === 'taskkill.exe')!
    expect(killCall.args).toEqual(['/PID', '54321', '/T'])
  })

  test('throws a diagnostic error when pidFile never appears within timeout', async () => {
    process.env.CLAUDE_WT_PANE_TIMEOUT_MS = '300'
    const calls: Call[] = []
    const backend = createBackend(calls, { simulatePidWrite: false })
    const pane = await backend.createTeammatePaneInSwarmView('slowpane', 'blue')
    let caught: unknown
    try {
      await backend.sendCommandToPane(pane.paneId, "Write-Output 'x'")
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain(
      `Windows Terminal pane failed to launch within ${formatDuration(300, { hideTrailingZeros: true })}`,
    )
  })

  test('error message includes paneId pidFile and override hint', async () => {
    process.env.CLAUDE_WT_PANE_TIMEOUT_MS = '250'
    const calls: Call[] = []
    const backend = createBackend(calls, { simulatePidWrite: false })
    const pane = await backend.createTeammatePaneInSwarmView(
      'diagpane',
      'green',
    )
    let caught: unknown
    try {
      await backend.sendCommandToPane(pane.paneId, "Write-Output 'x'")
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    const msg = (caught as Error).message
    expect(msg).toContain(pane.paneId)
    expect(msg).toContain('CLAUDE_WT_PANE_TIMEOUT_MS')
  })

  test('unlinks stale pidFile so a stale pid is not adopted', async () => {
    const calls: Call[] = []
    const backend = createBackend(calls, { simulatePidWrite: 30 })
    const pane = await backend.createTeammatePaneInSwarmView('stale', 'pink')
    // pidFile path is deterministic: <tempDir>/<sanitized paneId>.pid
    const stalePidFile = join(
      tempDir,
      `${pane.paneId.replace(/[^a-zA-Z0-9_-]/g, '-')}.pid`,
    )
    // Pre-seed stale content. If sendCommandToPane did NOT unlink, waitForPidFile
    // would immediately accept the stale identity and cache it. With unlink,
    // simulate's '54321' is the value killPane sees.
    await writeFile(stalePidFile, `99999|${ROOT_START_TIME}`, 'utf-8')

    await backend.sendCommandToPane(pane.paneId, "Write-Output 'x'")
    const killed = await backend.killPane(pane.paneId)
    expect(killed).toBe(true)
    expect(calls.find(call => call.command === 'taskkill.exe')!.args).toEqual([
      '/PID',
      '54321',
      '/T',
    ])
  })

  test('rejects re-spawn on a ready pane', async () => {
    const calls: Call[] = []
    const backend = createBackend(calls)
    const pane = await backend.createTeammatePaneInSwarmView('reentry', 'cyan')
    await backend.sendCommandToPane(pane.paneId, "Write-Output 'first'")
    // pane.status === 'ready' now. Second sendCommandToPane must throw.
    let caught: unknown
    try {
      await backend.sendCommandToPane(pane.paneId, "Write-Output 'second'")
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toMatch(/already spawned/)
  })

  test('throws on unknown paneId in sendCommandToPane', async () => {
    const calls: Call[] = []
    const backend = createBackend(calls)
    let caught: unknown
    try {
      await backend.sendCommandToPane('wt-nonexistent', "Write-Output 'x'")
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain('Unknown Windows Terminal pane')
  })

  test('rejects corrupted pidFile content ("123abc") and times out', async () => {
    process.env.CLAUDE_WT_PANE_TIMEOUT_MS = '400'
    const calls: Call[] = []
    // Custom runner writes invalid pid content (not all digits).
    const backend = new WindowsTerminalBackend({
      runCommand: async (command, args) => {
        calls.push({ command, args })
        if (command === 'wt.exe') {
          const encIdx = args.indexOf('-EncodedCommand')
          if (encIdx >= 0) {
            const decoded = Buffer.from(args[encIdx + 1]!, 'base64').toString(
              'utf16le',
            )
            const match = decoded.match(/Set-Content -LiteralPath '([^']+)'/)
            if (match) {
              setTimeout(() => {
                writeFile(match[1]!, '123abc', 'utf-8').catch(() => {})
              }, 30)
            }
          }
        }
        return { stdout: 'ok', stderr: '', code: 0 }
      },
      getPlatform: () => 'windows',
      pidFileDir: tempDir,
    })
    const pane = await backend.createTeammatePaneInSwarmView('corrupt', 'red')
    let caught: unknown
    try {
      await backend.sendCommandToPane(pane.paneId, "Write-Output 'x'")
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    // Inner error from waitForPidFile must reach the wrapped diagnostic message.
    const msg = (caught as Error).message
    expect(msg).toContain(
      `failed to launch within ${formatDuration(400, { hideTrailingZeros: true })}`,
    )
    expect(msg).toMatch(/not a valid pid|invalid pid|123abc/)
  })

  test('killPane awaits in-flight spawn before killing (kill-while-spawn race)', async () => {
    // simulatePidWrite: 800ms — sendCommandToPane stays in waitForPidFile for ~800ms.
    process.env.CLAUDE_WT_PANE_TIMEOUT_MS = '3000'
    const calls: Call[] = []
    const backend = createBackend(calls, { simulatePidWrite: 800 })
    const pane = await backend.createTeammatePaneInSwarmView('racy', 'blue')

    // Start spawn but don't await it yet.
    const spawnP = backend.sendCommandToPane(pane.paneId, "Write-Output 'x'")
    // 50ms later, call killPane — pane is still 'spawning', killPane must
    // await spawnPromise (which resolves at ~800ms when simulate writes pid 54321),
    // then kill using the cached pid.
    await new Promise(r => setTimeout(r, 50))
    const killP = backend.killPane(pane.paneId)

    // Both must resolve cleanly.
    await spawnP
    const killed = await killP
    expect(killed).toBe(true)
    // The kill must target the freshly-spawned pid (54321), not have used a
    // stale-or-missing fallback path.
    const killCall = calls.find(call => call.command === 'taskkill.exe')!
    expect(killCall.args).toEqual(['/PID', '54321', '/T'])
  })

  test('unconfirmed process-tree kill preserves metadata and can be retried', async () => {
    const calls: Call[] = []
    // The process remains visible and both graceful/forced tree kills fail.
    const backend = new WindowsTerminalBackend({
      runCommand: async (command, args) => {
        calls.push({ command, args })
        if (command === 'wt.exe') {
          const encIdx = args.indexOf('-EncodedCommand')
          if (encIdx >= 0) {
            const decoded = Buffer.from(args[encIdx + 1]!, 'base64').toString(
              'utf16le',
            )
            const match = decoded.match(/Set-Content -LiteralPath '([^']+)'/)
            if (match) {
              setTimeout(() => {
                writeFile(match[1]!, ROOT_IDENTITY, 'utf-8').catch(() => {})
              }, 30)
            }
          }
          return { stdout: 'ok', stderr: '', code: 0 }
        }
        if (command === 'powershell.exe') {
          return processInspectionResult(args, [ROOT_IDENTITY])
        }
        // Both graceful and forced taskkill fail.
        return { stdout: '', stderr: 'access denied', code: 1 }
      },
      getPlatform: () => 'windows',
      pidFileDir: tempDir,
    })
    const pane = await backend.createTeammatePaneInSwarmView('dier', 'orange')
    await backend.sendCommandToPane(pane.paneId, "Write-Output 'x'")

    const killed = await backend.killPane(pane.paneId)
    expect(killed).toBe(false)

    // Tracking is retained, so a second Stop attempts the tree again.
    const killedAgain = await backend.killPane(pane.paneId)
    expect(killedAgain).toBe(false)
    const killCalls = calls.filter(c => c.command === 'taskkill.exe')
    expect(killCalls).toHaveLength(4)
    expect(killCalls.some(call => call.args.includes('/F'))).toBe(true)
  })

  test('does not kill or forget a reused PID without a prior tree snapshot', async () => {
    const calls: Call[] = []
    const reusedIdentity = '54321|133700000000999999'
    const backend = new WindowsTerminalBackend({
      runCommand: async (command, args) => {
        calls.push({ command, args })
        if (command === 'wt.exe') {
          const encIdx = args.indexOf('-EncodedCommand')
          const decoded = Buffer.from(args[encIdx + 1]!, 'base64').toString(
            'utf16le',
          )
          const match = decoded.match(/Set-Content -LiteralPath '([^']+)'/)
          if (match) await writeFile(match[1]!, ROOT_IDENTITY, 'utf-8')
          return { stdout: '', stderr: '', code: 0 }
        }
        if (command === 'powershell.exe') {
          return processInspectionResult(args, [reusedIdentity])
        }
        return { stdout: '', stderr: '', code: 0 }
      },
      getPlatform: () => 'windows',
      pidFileDir: tempDir,
    })
    const pane = await backend.createTeammatePaneInSwarmView('reused', 'red')
    await backend.sendCommandToPane(pane.paneId, "Write-Output 'x'")

    expect(await backend.killPane(pane.paneId)).toBe(false)
    expect(calls.some(call => call.command === 'taskkill.exe')).toBe(false)
    expect(await backend.killPane(pane.paneId)).toBe(false)
  })

  test('bounds a hung taskkill command and retains tracking for retry', async () => {
    process.env.CLAUDE_WT_KILL_TIMEOUT_MS = '20'
    process.env.CLAUDE_WT_KILL_COMMAND_TIMEOUT_MS = '20'
    const calls: Call[] = []
    let liveIdentities = [ROOT_IDENTITY]
    let hangTaskkill = true
    const backend = new WindowsTerminalBackend({
      runCommand: async (command, args) => {
        calls.push({ command, args })
        if (command === 'wt.exe') {
          const encIdx = args.indexOf('-EncodedCommand')
          const decoded = Buffer.from(args[encIdx + 1]!, 'base64').toString(
            'utf16le',
          )
          const match = decoded.match(/Set-Content -LiteralPath '([^']+)'/)
          if (match) await writeFile(match[1]!, ROOT_IDENTITY, 'utf-8')
          return { stdout: '', stderr: '', code: 0 }
        }
        if (command === 'powershell.exe') {
          return processInspectionResult(args, liveIdentities)
        }
        if (command === 'taskkill.exe') {
          if (hangTaskkill) {
            return await new Promise<{
              stdout: string
              stderr: string
              code: number
            }>(() => {})
          }
          liveIdentities = []
        }
        return { stdout: '', stderr: '', code: 0 }
      },
      getPlatform: () => 'windows',
      pidFileDir: tempDir,
    })
    const pane = await backend.createTeammatePaneInSwarmView('hung', 'blue')
    await backend.sendCommandToPane(pane.paneId, "Write-Output 'x'")

    const startedAt = Date.now()
    expect(await backend.killPane(pane.paneId)).toBe(false)
    expect(Date.now() - startedAt).toBeLessThan(1_000)

    hangTaskkill = false
    expect(await backend.killPane(pane.paneId)).toBe(true)
  })

  test('does not signal or forget a pane when tree inspection times out', async () => {
    process.env.CLAUDE_WT_KILL_COMMAND_TIMEOUT_MS = '20'
    const calls: Call[] = []
    let hangTreeInspection = true
    let liveIdentities = [ROOT_IDENTITY]
    const backend = new WindowsTerminalBackend({
      runCommand: async (command, args) => {
        calls.push({ command, args })
        if (command === 'wt.exe') {
          const encIdx = args.indexOf('-EncodedCommand')
          const decoded = Buffer.from(args[encIdx + 1]!, 'base64').toString(
            'utf16le',
          )
          const match = decoded.match(/Set-Content -LiteralPath '([^']+)'/)
          if (match) await writeFile(match[1]!, ROOT_IDENTITY, 'utf-8')
          return { stdout: '', stderr: '', code: 0 }
        }
        if (
          command === 'powershell.exe' &&
          getPowerShellScript(args).includes('Get-CimInstance') &&
          hangTreeInspection
        ) {
          return await new Promise<{
            stdout: string
            stderr: string
            code: number
          }>(() => {})
        }
        if (command === 'powershell.exe') {
          return processInspectionResult(args, liveIdentities)
        }
        if (command === 'taskkill.exe') liveIdentities = []
        return { stdout: '', stderr: '', code: 0 }
      },
      getPlatform: () => 'windows',
      pidFileDir: tempDir,
    })
    const pane = await backend.createTeammatePaneInSwarmView(
      'inspection-timeout',
      'cyan',
    )
    await backend.sendCommandToPane(pane.paneId, "Write-Output 'x'")

    const startedAt = Date.now()
    expect(await backend.killPane(pane.paneId)).toBe(false)
    expect(Date.now() - startedAt).toBeLessThan(500)
    expect(calls.some(call => call.command === 'taskkill.exe')).toBe(false)

    hangTreeInspection = false
    expect(await backend.killPane(pane.paneId)).toBe(true)
  })

  test('escalates until every snapshotted tree member exits', async () => {
    process.env.CLAUDE_WT_KILL_TIMEOUT_MS = '20'
    const childIdentity = '54322|133700000000000001'
    const calls: Call[] = []
    let liveIdentities = [ROOT_IDENTITY, childIdentity]
    const backend = new WindowsTerminalBackend({
      runCommand: async (command, args) => {
        calls.push({ command, args })
        if (command === 'wt.exe') {
          const encIdx = args.indexOf('-EncodedCommand')
          const decoded = Buffer.from(args[encIdx + 1]!, 'base64').toString(
            'utf16le',
          )
          const match = decoded.match(/Set-Content -LiteralPath '([^']+)'/)
          if (match) await writeFile(match[1]!, ROOT_IDENTITY, 'utf-8')
          return { stdout: '', stderr: '', code: 0 }
        }
        if (command === 'powershell.exe') {
          return processInspectionResult(args, liveIdentities)
        }
        if (command === 'taskkill.exe') {
          liveIdentities = args.includes('/F') ? [] : [childIdentity]
        }
        return { stdout: '', stderr: '', code: 0 }
      },
      getPlatform: () => 'windows',
      pidFileDir: tempDir,
    })
    const pane = await backend.createTeammatePaneInSwarmView('tree', 'green')
    await backend.sendCommandToPane(pane.paneId, "Write-Output 'x'")

    expect(await backend.killPane(pane.paneId)).toBe(true)
    expect(
      calls.some(
        call => call.command === 'taskkill.exe' && call.args.includes('/F'),
      ),
    ).toBe(true)
  })

  test('keeps an orphaned launch tracked until its identity appears', async () => {
    process.env.CLAUDE_WT_PANE_TIMEOUT_MS = '100'
    const calls: Call[] = []
    let liveIdentities = [ROOT_IDENTITY]
    const backend = new WindowsTerminalBackend({
      runCommand: async (command, args) => {
        calls.push({ command, args })
        if (command === 'powershell.exe') {
          return processInspectionResult(args, liveIdentities)
        }
        if (command === 'taskkill.exe') liveIdentities = []
        return { stdout: '', stderr: '', code: 0 }
      },
      getPlatform: () => 'windows',
      pidFileDir: tempDir,
    })
    const pane = await backend.createTeammatePaneInSwarmView(
      'late-identity',
      'pink',
    )
    await expect(
      backend.sendCommandToPane(pane.paneId, "Write-Output 'x'"),
    ).rejects.toThrow('failed to launch')

    expect(await backend.killPane(pane.paneId)).toBe(false)
    const pidFile = join(
      tempDir,
      `${pane.paneId.replace(/[^a-zA-Z0-9_-]/g, '-')}.pid`,
    )
    await writeFile(pidFile, ROOT_IDENTITY, 'utf-8')
    expect(await backend.killPane(pane.paneId)).toBe(true)
  })

  test('recovers process identity when Stop uses a fresh backend instance', async () => {
    const launchCalls: Call[] = []
    const launcher = createBackend(launchCalls)
    const pane = await launcher.createTeammatePaneInSwarmView(
      'cross-instance',
      'orange',
    )
    await launcher.sendCommandToPane(pane.paneId, "Write-Output 'x'")

    const stopCalls: Call[] = []
    let liveIdentities = [ROOT_IDENTITY]
    const stopper = new WindowsTerminalBackend({
      runCommand: async (command, args) => {
        stopCalls.push({ command, args })
        if (command === 'powershell.exe') {
          return processInspectionResult(args, liveIdentities)
        }
        if (command === 'taskkill.exe') liveIdentities = []
        return { stdout: '', stderr: '', code: 0 }
      },
      getPlatform: () => 'windows',
      pidFileDir: tempDir,
    })

    expect(await stopper.killPane(pane.paneId)).toBe(true)
    expect(
      stopCalls.some(
        call => call.command === 'taskkill.exe' && call.args.includes('54321'),
      ),
    ).toBe(true)
  })

  test('killPane uses cached pid and returns false when pane is unknown', async () => {
    const calls: Call[] = []
    const backend = createBackend(calls, { simulatePidWrite: 30 })
    const pane = await backend.createTeammatePaneInSwarmView('cached', 'yellow')
    await backend.sendCommandToPane(pane.paneId, "Write-Output 'x'")

    // After sendCommandToPane, pane.pid = 54321 (from simulate). killPane must
    // use this cached pid without reading the pidFile at all.
    const killed = await backend.killPane(pane.paneId)
    expect(killed).toBe(true)
    expect(calls.find(call => call.command === 'taskkill.exe')!.args).toEqual([
      '/PID',
      '54321',
      '/T',
    ])

    // After kill, pane is removed — a second killPane must return false.
    const killedAgain = await backend.killPane(pane.paneId)
    expect(killedAgain).toBe(false)
  })
})
