import { randomUUID } from 'crypto'
import { readFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import type { AgentColorName } from '@claude-code-best/builtin-tools/tools/AgentTool/agentColorManager.js'
import { logForDebugging } from '../../../utils/debug.js'
import { execFileNoThrow } from '../../../utils/execFileNoThrow.js'
import { getPlatform, type Platform } from '../../../utils/platform.js'
import { isInWindowsTerminal } from './detection.js'
import { registerWindowsTerminalBackend } from './registry.js'
import type { CreatePaneResult, PaneBackend, PaneId } from './types.js'

type CommandResult = { stdout: string; stderr: string; code: number }
type CommandRunner = (
  command: string,
  args: string[],
  timeoutMs?: number,
) => Promise<CommandResult>

type PaneStatus =
  | 'registered'
  | 'spawning'
  | 'ready'
  | 'orphaned'
  | 'killing'
  | 'dead'

type ProcessIdentity = {
  pid: number
  startedAtFileTime: string
}

type WindowsTerminalPane = {
  title: string
  mode: 'pane' | 'window'
  pidFile: string
  status: PaneStatus
  processIdentity?: ProcessIdentity
  pendingTree?: ProcessIdentity[]
  spawnPromise?: Promise<void>
  killPromise?: Promise<boolean>
}

function quotePowerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function wrapPowerShellCommand(command: string, pidFile: string): string {
  const quotedPidFile = quotePowerShellString(pidFile)
  // PowerShell requires try/catch/finally to be a single compound statement —
  // semicolons between the blocks cause "Try 语句缺少自己的 Catch 或 Finally 块".
  // Use newlines (\n) so the parser treats it as one statement.
  return [
    "$ErrorActionPreference = 'Stop'",
    '$processStartTicks = (Get-Process -Id $PID -ErrorAction Stop).StartTime.ToFileTimeUtc()',
    '$processStartTime = $processStartTicks - ($processStartTicks % 10)',
    `Set-Content -LiteralPath ${quotedPidFile} -Value "$PID|$processStartTime"`,
    [
      `try { ${command}; if ($LASTEXITCODE -is [int]) { exit $LASTEXITCODE } }`,
      `catch { Write-Error $_; exit 1 }`,
      `finally { Remove-Item -LiteralPath ${quotedPidFile} -Force -ErrorAction SilentlyContinue }`,
    ].join('\n'),
  ].join('; ')
}

const WT_PANE_TIMEOUT_DEFAULT_MS = 8000
const WT_PANE_POLL_INTERVAL_MS = 200
const WT_KILL_TIMEOUT_DEFAULT_MS = 2_000
const WT_KILL_COMMAND_TIMEOUT_DEFAULT_MS = 1_000

function getWtPaneTimeoutMs(): number {
  const raw = process.env.CLAUDE_WT_PANE_TIMEOUT_MS
  if (!raw) return WT_PANE_TIMEOUT_DEFAULT_MS
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : WT_PANE_TIMEOUT_DEFAULT_MS
}

function getWtKillTimeoutMs(): number {
  const raw = process.env.CLAUDE_WT_KILL_TIMEOUT_MS
  if (!raw) return WT_KILL_TIMEOUT_DEFAULT_MS
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : WT_KILL_TIMEOUT_DEFAULT_MS
}

function getWtKillCommandTimeoutMs(): number {
  const raw = process.env.CLAUDE_WT_KILL_COMMAND_TIMEOUT_MS
  if (!raw) return WT_KILL_COMMAND_TIMEOUT_DEFAULT_MS
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : WT_KILL_COMMAND_TIMEOUT_DEFAULT_MS
}

function parseProcessIdentity(content: string): ProcessIdentity | null {
  const match = /^(\d+)\|(\d+)$/.exec(content.trim())
  if (!match) return null

  const pid = Number.parseInt(match[1]!, 10)
  if (!Number.isFinite(pid) || pid <= 0) return null

  return {
    pid,
    startedAtFileTime: match[2]!,
  }
}

async function waitForPidFile(
  pidFile: string,
  timeoutMs: number,
): Promise<ProcessIdentity> {
  const deadline = Date.now() + timeoutMs
  let lastErr: unknown
  while (Date.now() < deadline) {
    try {
      const content = (await readFile(pidFile, 'utf-8')).trim()
      const identity = parseProcessIdentity(content)
      if (!identity) {
        lastErr = new Error(
          `pidFile content not a valid process identity: ${JSON.stringify(content)}`,
        )
      } else {
        return identity
      }
    } catch (err) {
      lastErr = err
    }
    await new Promise(r => setTimeout(r, WT_PANE_POLL_INTERVAL_MS))
  }
  throw lastErr ?? new Error('pidFile never appeared')
}

/**
 * WindowsTerminalBackend uses wt.exe to create visible teammate panes/tabs.
 *
 * Windows Terminal's CLI starts commands directly in a new pane; it does not
 * expose a stable pane id that can later receive arbitrary input. To fit the
 * PaneBackend contract, createTeammatePaneInSwarmView allocates an internal id,
 * and sendCommandToPane performs the actual `wt split-pane` launch.
 */
export class WindowsTerminalBackend implements PaneBackend {
  readonly type = 'windows-terminal' as const
  readonly displayName = 'Windows Terminal'
  readonly supportsHideShow = false

  private panes = new Map<PaneId, WindowsTerminalPane>()

  private readonly runCommand: CommandRunner
  private readonly getPlatformValue: () => Platform
  private readonly pidFileDir: string

  constructor(
    runCommandOrOptions?:
      | CommandRunner
      | {
          runCommand?: CommandRunner
          getPlatform?: () => Platform
          pidFileDir?: string
        },
    getPlatformValue?: () => Platform,
  ) {
    if (
      typeof runCommandOrOptions === 'function' ||
      runCommandOrOptions === undefined
    ) {
      this.runCommand =
        runCommandOrOptions ??
        ((command, args, timeoutMs) =>
          execFileNoThrow(command, args, {
            timeout: timeoutMs,
            preserveOutputOnError: true,
            useCwd: true,
          }))
      this.getPlatformValue = getPlatformValue ?? getPlatform
      this.pidFileDir = tmpdir()
    } else {
      this.runCommand =
        runCommandOrOptions.runCommand ??
        ((command, args, timeoutMs) =>
          execFileNoThrow(command, args, {
            timeout: timeoutMs,
            preserveOutputOnError: true,
            useCwd: true,
          }))
      this.getPlatformValue = runCommandOrOptions.getPlatform ?? getPlatform
      this.pidFileDir = runCommandOrOptions.pidFileDir ?? tmpdir()
    }
  }

  /**
   * Every OS query in the Stop path has a hard deadline. The default runner
   * also receives the timeout so execa terminates the child; Promise.race is a
   * second line of defence for injected/custom runners that ignore it.
   */
  private async runCommandWithDeadline(
    command: string,
    args: string[],
  ): Promise<CommandResult> {
    const timeoutMs = getWtKillCommandTimeoutMs()
    let timeout: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<CommandResult>(resolve => {
      timeout = setTimeout(
        () =>
          resolve({
            stdout: '',
            stderr: `${command} timed out after ${timeoutMs}ms`,
            code: 1,
          }),
        timeoutMs + 50,
      )
    })
    const commandResult = this.runCommand(command, args, timeoutMs).catch(
      (error: unknown): CommandResult => ({
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        code: 1,
      }),
    )

    try {
      return await Promise.race([commandResult, timedOut])
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }

  private async inspectProcessIdentity(
    pid: number,
  ): Promise<ProcessIdentity | 'missing' | null> {
    const script = [
      `$process = Get-Process -Id ${pid} -ErrorAction SilentlyContinue`,
      "if ($null -eq $process) { [Console]::Out.Write('MISSING'); exit 0 }",
      'try { $startTicks = $process.StartTime.ToFileTimeUtc(); [Console]::Out.Write($startTicks - ($startTicks % 10)) }',
      'catch { [Console]::Error.Write($_); exit 2 }',
    ].join('; ')
    const result = await this.runCommandWithDeadline('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
    ])
    if (result.code !== 0) return null

    const output = result.stdout.trim()
    if (output === 'MISSING') return 'missing'
    if (!/^\d+$/.test(output)) return null
    return { pid, startedAtFileTime: output }
  }

  private async captureProcessTree(
    root: ProcessIdentity,
  ): Promise<ProcessIdentity[] | null> {
    const script = [
      '$allProcesses = @(Get-CimInstance Win32_Process -ErrorAction Stop)',
      '$processesById = @{}',
      'foreach ($snapshot in $allProcesses) { $processesById[[int]$snapshot.ProcessId] = $snapshot }',
      '$pending = [System.Collections.Generic.Queue[int]]::new()',
      '$seen = [System.Collections.Generic.HashSet[int]]::new()',
      `$pending.Enqueue(${root.pid})`,
      'while ($pending.Count -gt 0) {',
      '  $currentPid = $pending.Dequeue()',
      '  if (-not $seen.Add($currentPid)) { continue }',
      '  foreach ($child in $allProcesses) {',
      '    if ($child.ParentProcessId -eq $currentPid) { $pending.Enqueue([int]$child.ProcessId) }',
      '  }',
      '}',
      'foreach ($processId in $seen) {',
      '  $snapshot = $processesById[$processId]',
      '  if ($null -ne $snapshot) {',
      "    try { $startTicks = $snapshot.CreationDate.ToFileTimeUtc(); [Console]::Out.WriteLine(('{0}|{1}' -f $processId, ($startTicks - ($startTicks % 10)))) } catch { [Console]::Error.Write($_); exit 2 }",
      '  }',
      '}',
    ].join('\n')
    const result = await this.runCommandWithDeadline('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
    ])
    if (result.code !== 0) return null

    const identities = new Map<number, ProcessIdentity>()
    for (const line of result.stdout.split(/\r?\n/)) {
      const identity = parseProcessIdentity(line)
      if (identity) identities.set(identity.pid, identity)
    }
    const capturedRoot = identities.get(root.pid)
    if (
      !capturedRoot ||
      capturedRoot.startedAtFileTime !== root.startedAtFileTime
    ) {
      // The root exited or its PID was reused between the first identity check
      // and the CIM snapshot. Do not act on the replacement's descendants.
      return null
    }
    identities.set(root.pid, root)
    return [...identities.values()]
  }

  private async inspectLiveTreeMembers(
    identities: ProcessIdentity[],
  ): Promise<ProcessIdentity[] | null> {
    const expected = identities
      .map(identity => `'${identity.pid}|${identity.startedAtFileTime}'`)
      .join(',')
    const script = [
      `$expected = @(${expected})`,
      'foreach ($entry in $expected) {',
      "  $parts = $entry.Split('|')",
      '  $processId = [int]$parts[0]',
      '  $expectedStart = $parts[1]',
      '  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue',
      '  if ($null -ne $process) {',
      '    try {',
      '      $startTicks = $process.StartTime.ToFileTimeUtc()',
      '      $actualStart = ($startTicks - ($startTicks % 10)).ToString()',
      "      if ($actualStart -eq $expectedStart) { [Console]::Out.WriteLine(('{0}|{1}' -f $processId, $actualStart)) }",
      '    } catch { [Console]::Error.Write($_); exit 2 }',
      '  }',
      '}',
    ].join('\n')
    const result = await this.runCommandWithDeadline('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
    ])
    if (result.code !== 0) return null

    return result.stdout
      .split(/\r?\n/)
      .map(parseProcessIdentity)
      .filter((identity): identity is ProcessIdentity => identity !== null)
  }

  private makePidFile(paneId: string): string {
    return join(
      this.pidFileDir,
      `${paneId.replace(/[^a-zA-Z0-9_-]/g, '-')}.pid`,
    )
  }

  async isAvailable(): Promise<boolean> {
    if (this.getPlatformValue() !== 'windows') {
      return false
    }
    // Do NOT run `wt.exe --version` — wt.exe is a UWP app bridge that opens
    // the Windows Terminal app to render version info, producing a phantom
    // "Windows 终端 1.24.x" window every time availability is checked.
    // Instead, check the WT_SESSION env var (set inside WT) or verify the
    // binary exists on PATH without executing it.
    if (process.env.WT_SESSION) {
      return true
    }
    const result = await this.runCommand('where.exe', ['wt.exe'])
    return result.code === 0
  }

  async isRunningInside(): Promise<boolean> {
    return this.getPlatformValue() === 'windows' && isInWindowsTerminal()
  }

  async createTeammatePaneInSwarmView(
    name: string,
    _color: AgentColorName,
  ): Promise<CreatePaneResult> {
    const paneId = `wt-${randomUUID()}`
    const isFirstTeammate = this.panes.size === 0
    this.panes.set(paneId, {
      title: name,
      mode: 'pane',
      pidFile: this.makePidFile(paneId),
      status: 'registered',
    })
    return { paneId, isFirstTeammate }
  }

  async createTeammateWindowInSwarmView(
    name: string,
    _color: AgentColorName,
  ): Promise<CreatePaneResult & { windowName: string }> {
    const paneId = `wt-${randomUUID()}`
    const windowName = `teammate-${name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`
    this.panes.set(paneId, {
      title: name,
      mode: 'window',
      pidFile: this.makePidFile(paneId),
      status: 'registered',
    })
    return { paneId, isFirstTeammate: false, windowName }
  }

  async sendCommandToPane(
    paneId: PaneId,
    command: string,
    _useExternalSession?: boolean,
  ): Promise<void> {
    const pane = this.panes.get(paneId)
    if (!pane) {
      throw new Error(`Unknown Windows Terminal pane id: ${paneId}`)
    }

    // 拒绝 ready 态重 spawn（避免同 pidFile 双进程竞争）
    if (pane.status === 'ready' || pane.status === 'killing') {
      throw new Error(
        `Pane ${paneId} already spawned (status=${pane.status}); create a new pane to re-launch`,
      )
    }
    if (pane.status === 'spawning') {
      throw new Error(
        `Pane ${paneId} is currently spawning; wait for the in-flight launch to complete`,
      )
    }
    if (pane.status === 'dead') {
      throw new Error(`Pane ${paneId} is dead; create a new pane`)
    }
    if (pane.status === 'orphaned') {
      throw new Error(
        `Pane ${paneId} has an unconfirmed launch; Stop it before creating a replacement`,
      )
    }
    // pane.status === 'registered' → 继续

    // 提前赋值 spawnPromise 在任何 await 前（inner Promise 包装）
    // Attach a no-op .catch() immediately to prevent unhandled rejection warnings
    // in case killPane never awaits spawnPromise (e.g. sendCommandToPane fails
    // before killPane is called).
    let resolveSpawn!: () => void
    let rejectSpawn!: (err: unknown) => void
    const spawnPromise = new Promise<void>((res, rej) => {
      resolveSpawn = res
      rejectSpawn = rej
    })
    // Silence unhandled-rejection: killPane may .catch() this later, but if
    // the pane dies before any kill is attempted, the rejection must not leak.
    spawnPromise.catch(() => {})
    pane.status = 'spawning'
    pane.spawnPromise = spawnPromise

    try {
      const launcher = wrapPowerShellCommand(command, pane.pidFile)
      // wt.exe treats ';' as its own command separator, which breaks
      // multi-statement PowerShell commands passed via -Command. Encode the
      // entire script as Base64 UTF-16LE and use -EncodedCommand instead.
      const encoded = Buffer.from(launcher, 'utf16le').toString('base64')
      const args =
        pane.mode === 'window'
          ? ['-w', '-1', 'new-tab', '--title', pane.title]
          : ['-w', '0', 'split-pane', '--vertical', '--title', pane.title]

      await unlink(pane.pidFile).catch(() => {})

      const result = await this.runCommand('wt.exe', [
        ...args,
        'powershell.exe',
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encoded,
      ])

      if (result.code !== 0) {
        throw new Error(
          `Failed to launch Windows Terminal teammate ${paneId}: ${result.stderr}`,
        )
      }

      const timeoutMs = getWtPaneTimeoutMs()
      let processIdentity: ProcessIdentity
      try {
        processIdentity = await waitForPidFile(pane.pidFile, timeoutMs)
      } catch (err) {
        throw new Error(
          `Windows Terminal pane failed to launch within ${timeoutMs}ms\n` +
            `  paneId: ${paneId}\n` +
            `  pidFile: ${pane.pidFile}\n` +
            `  wt.exe stdout: ${result.stdout || '(empty)'}\n` +
            `  wt.exe stderr: ${result.stderr || '(empty)'}\n` +
            `  underlying: ${err instanceof Error ? err.message : String(err)}\n` +
            `  override timeout via env CLAUDE_WT_PANE_TIMEOUT_MS`,
        )
      }

      pane.processIdentity = processIdentity
      pane.status = 'ready'
      resolveSpawn()
    } catch (err) {
      // wt.exe may have accepted the launch even if the PID handshake failed.
      // Keep the pane addressable so a later Stop can retry the pidFile and
      // never discard a potentially live process without confirmation.
      pane.status = 'orphaned'
      pane.processIdentity = undefined
      rejectSpawn(err)
      throw err
    } finally {
      pane.spawnPromise = undefined
    }
  }

  async setPaneBorderColor(
    _paneId: PaneId,
    _color: AgentColorName,
    _useExternalSession?: boolean,
  ): Promise<void> {
    // Windows Terminal does not expose per-pane border colors through wt.exe.
  }

  async setPaneTitle(
    _paneId: PaneId,
    _name: string,
    _color: AgentColorName,
    _useExternalSession?: boolean,
  ): Promise<void> {
    // Title is passed at launch in sendCommandToPane.
  }

  async enablePaneBorderStatus(
    _windowTarget?: string,
    _useExternalSession?: boolean,
  ): Promise<void> {
    // Not supported by Windows Terminal's wt.exe surface.
  }

  async rebalancePanes(
    _windowTarget: string,
    _hasLeader: boolean,
  ): Promise<void> {
    // Windows Terminal handles split layout itself.
  }

  async killPane(
    paneId: PaneId,
    _useExternalSession?: boolean,
  ): Promise<boolean> {
    let pane = this.panes.get(paneId)
    if (!pane) {
      // A different leader process (or a freshly constructed backend) may
      // receive the Stop request. Recover the identity handshake from disk;
      // never fall back to a naked PID or an unverified process lookup.
      const pidFile = this.makePidFile(paneId)
      let recoveredIdentity: ProcessIdentity | null = null
      try {
        recoveredIdentity = parseProcessIdentity(
          (await readFile(pidFile, 'utf-8')).trim(),
        )
      } catch {
        // Missing/unreadable handshake means the target cannot be proven.
      }
      if (!recoveredIdentity) return false

      pane = {
        title: paneId,
        mode: 'pane',
        pidFile,
        status: 'orphaned',
        processIdentity: recoveredIdentity,
      }
      this.panes.set(paneId, pane)
    }

    // Concurrent Stop callers must observe one shared, authoritative result.
    if (pane.killPromise) return pane.killPromise

    const killPromise = this.killPaneOnce(paneId, pane)
    pane.killPromise = killPromise
    try {
      return await killPromise
    } finally {
      if (pane.killPromise === killPromise) {
        pane.killPromise = undefined
      }
    }
  }

  private async killPaneOnce(
    paneId: PaneId,
    pane: WindowsTerminalPane,
  ): Promise<boolean> {
    // Resolve the kill-while-spawn race before reading status or identity.
    if (pane.status === 'spawning' && pane.spawnPromise) {
      await pane.spawnPromise.catch(() => {})
    }

    if (pane.status === 'registered') {
      // No launch command has been issued, so there is no process to confirm.
      pane.status = 'dead'
      this.panes.delete(paneId)
      return true
    }
    if (pane.status === 'dead') {
      this.panes.delete(paneId)
      return true
    }
    if (pane.status !== 'ready' && pane.status !== 'orphaned') {
      return false
    }

    const retryStatus = pane.status
    pane.status = 'killing'

    let identity = pane.processIdentity
    if (!identity) {
      // A successful wt.exe invocation can outlive a delayed pidFile write.
      // Retry the handshake, but retain tracking if identity is still unknown.
      for (let attempt = 0; attempt < 3 && !identity; attempt++) {
        try {
          const content = (await readFile(pane.pidFile, 'utf-8')).trim()
          identity = parseProcessIdentity(content) ?? undefined
        } catch {
          // The launcher may still be between process start and Set-Content.
        }
        if (!identity && attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
      if (!identity) {
        pane.status = retryStatus
        logForDebugging(
          `[WindowsTerminalBackend] killPane ${paneId}: process identity unavailable; preserving tracking`,
        )
        return false
      }
      pane.processIdentity = identity
    }

    let processTree = pane.pendingTree
    let liveBeforeKill: ProcessIdentity[]
    if (!processTree) {
      // PID alone is unsafe: Windows can reuse it after the original shell
      // exits. Match creation time before enumerating or signalling anything.
      const currentIdentity = await this.inspectProcessIdentity(identity.pid)
      if (currentIdentity === null) {
        pane.status = retryStatus
        logForDebugging(
          `[WindowsTerminalBackend] killPane ${paneId} pid=${identity.pid}: identity inspection failed; preserving tracking`,
        )
        return false
      }
      if (
        currentIdentity === 'missing' ||
        currentIdentity.startedAtFileTime !== identity.startedAtFileTime
      ) {
        // Never signal a reused PID. Without a pre-stop tree snapshot, root
        // absence alone cannot prove that descendants also exited.
        pane.status = retryStatus
        logForDebugging(
          `[WindowsTerminalBackend] killPane ${paneId} pid=${identity.pid}: original root absent${currentIdentity === 'missing' ? '' : ' (PID reused)'} but tree was not captured; preserving tracking`,
        )
        return false
      }

      // Snapshot descendants before termination. taskkill /T requests the
      // whole tree; the snapshot provides identity-safe post-kill proof.
      const capturedTree = await this.captureProcessTree(identity)
      if (!capturedTree) {
        pane.status = retryStatus
        logForDebugging(
          `[WindowsTerminalBackend] killPane ${paneId} pid=${identity.pid}: process-tree inspection failed; preserving tracking`,
        )
        return false
      }
      processTree = capturedTree
      pane.pendingTree = processTree
      const capturedLiveMembers = await this.inspectLiveTreeMembers(processTree)
      const capturedRootStillLive = capturedLiveMembers?.some(
        member =>
          member.pid === identity.pid &&
          member.startedAtFileTime === identity.startedAtFileTime,
      )
      if (!capturedLiveMembers || !capturedRootStillLive) {
        // Preserve the snapshot for a retry if inspection itself failed, but
        // never signal a missing/reused root during this attempt.
        pane.status = retryStatus
        return false
      }
      liveBeforeKill = capturedLiveMembers
    } else {
      // A previous attempt may have killed the root but timed out while
      // confirming descendants. Resume from the exact stored identities.
      const liveMembers = await this.inspectLiveTreeMembers(processTree)
      if (liveMembers === null) {
        pane.status = retryStatus
        return false
      }
      if (liveMembers.length === 0) {
        pane.processIdentity = undefined
        pane.pendingTree = undefined
        pane.status = 'dead'
        this.panes.delete(paneId)
        await unlink(pane.pidFile).catch(() => {})
        return true
      }
      liveBeforeKill = liveMembers
    }

    const waitForTreeExit = async (): Promise<boolean> => {
      const deadline = Date.now() + getWtKillTimeoutMs()
      while (true) {
        const liveMembers = await this.inspectLiveTreeMembers(processTree)
        if (liveMembers === null) return false
        if (liveMembers.length === 0) return true
        if (Date.now() >= deadline) return false
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    const pickKillTargets = (
      liveMembers: ProcessIdentity[],
    ): ProcessIdentity[] => {
      const liveRoot = liveMembers.find(
        member =>
          member.pid === identity.pid &&
          member.startedAtFileTime === identity.startedAtFileTime,
      )
      // /T on a live root covers its descendants. If the root already exited,
      // target each still-live snapshotted descendant individually.
      return liveRoot ? [liveRoot] : liveMembers
    }
    const signalTreeMembers = async (
      liveMembers: ProcessIdentity[],
      force: boolean,
    ): Promise<CommandResult[]> =>
      Promise.all(
        pickKillTargets(liveMembers).map(member =>
          this.runCommandWithDeadline('taskkill.exe', [
            '/PID',
            String(member.pid),
            '/T',
            ...(force ? ['/F'] : []),
          ]),
        ),
      )

    const graceful = await signalTreeMembers(liveBeforeKill, false)
    let killed = await waitForTreeExit()
    let forced: CommandResult[] = []
    if (!killed) {
      const liveAfterGrace = await this.inspectLiveTreeMembers(processTree)
      if (liveAfterGrace !== null && liveAfterGrace.length > 0) {
        forced = await signalTreeMembers(liveAfterGrace, true)
        killed = await waitForTreeExit()
      }
    }

    if (killed) {
      pane.processIdentity = undefined
      pane.pendingTree = undefined
      pane.status = 'dead'
      this.panes.delete(paneId)
      await unlink(pane.pidFile).catch(() => {})
    } else {
      // Preserve identity and metadata so the user can retry Stop. A command
      // exit code, timeout, or root disappearance alone is not tree proof.
      pane.status = retryStatus
    }

    logForDebugging(
      `[WindowsTerminalBackend] killPane ${paneId} pid=${identity.pid} treeSize=${processTree.length} graceful=${graceful.map(result => result.code).join(',')} force=${forced.length > 0 ? forced.map(result => result.code).join(',') : 'not-needed'} confirmed=${killed}`,
    )
    return killed
  }

  async hidePane(
    _paneId: PaneId,
    _useExternalSession?: boolean,
  ): Promise<boolean> {
    return false
  }

  async showPane(
    _paneId: PaneId,
    _targetWindowOrPane: string,
    _useExternalSession?: boolean,
  ): Promise<boolean> {
    return false
  }
}

// Register the backend with the registry when this module is imported.
// This side effect is intentional - the registry needs backends to self-register.
// eslint-disable-next-line custom-rules/no-top-level-side-effects
registerWindowsTerminalBackend(WindowsTerminalBackend)
