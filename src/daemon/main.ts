import { type ChildProcess } from 'child_process'
import { resolve } from 'path'
import { t, tf } from '../i18n/t.js'
import { buildCliLaunch, spawnCli } from '../utils/cliLaunch.js'
import { terminateProcessTree } from '../utils/processTermination.js'
import {
  writeDaemonState,
  removeDaemonState,
  queryDaemonStatus,
  stopDaemonByPid,
} from './state.js'

/**
 * Exit code used by workers for permanent (non-retryable) failures.
 * @see workerRegistry.ts EXIT_CODE_PERMANENT
 */
const EXIT_CODE_PERMANENT = 78

/**
 * Backoff config for restarting crashed workers.
 */
const BACKOFF_INITIAL_MS = 2_000
const BACKOFF_CAP_MS = 120_000
const BACKOFF_MULTIPLIER = 2
const MAX_RAPID_FAILURES = 5 // Park worker after this many fast crashes
const WORKER_SHUTDOWN_GRACE_MS = 30_000
const WORKER_FORCE_KILL_WAIT_MS = 5_000

interface WorkerState {
  kind: string
  process: ChildProcess | null
  backoffMs: number
  failureCount: number
  parked: boolean
  lastStartTime: number
  restartTimer: ReturnType<typeof setTimeout> | null
}

/**
 * Daemon supervisor entry point. Called from `cli.tsx` via:
 *   `claude daemon [subcommand]`
 *
 * Manages the daemon supervisor AND background sessions under one namespace.
 *
 * Subcommands:
 *   (none)  — unified status (supervisor + sessions)
 *   start   — start the supervisor with default workers
 *   stop    — send SIGTERM to supervisor
 *   status  — unified status (supervisor + sessions)
 *   ps      — alias for status
 *   bg      — start a background session
 *   attach  — attach to a background session
 *   logs    — show session logs
 *   kill    — kill a session
 */
export async function daemonMain(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status'

  switch (subcommand) {
    // --- Supervisor management ---
    case 'start':
      await runSupervisor(args.slice(1))
      break
    case 'stop':
      await handleDaemonStop()
      break

    // --- Unified status ---
    case 'status':
    case 'ps':
      await showUnifiedStatus()
      break

    // --- Session management (delegates to bg.ts) ---
    case 'bg': {
      const bg = await import('../cli/bg.js')
      await bg.handleBgStart(args.slice(1))
      break
    }
    case 'attach': {
      const bg = await import('../cli/bg.js')
      await bg.attachHandler(args[1])
      break
    }
    case 'logs': {
      const bg = await import('../cli/bg.js')
      await bg.logsHandler(args[1])
      break
    }
    case 'kill': {
      const bg = await import('../cli/bg.js')
      await bg.killHandler(args[1])
      break
    }

    case '--help':
    case '-h':
    case 'help':
      printHelp()
      break
    default:
      console.error(
        tf('Unknown daemon subcommand: {subcommand}', { subcommand }),
      )
      printHelp()
      process.exitCode = 1
  }
}

function printHelp(): void {
  console.log(
    t(`
Claude Code Daemon — background process management

USAGE
  claude daemon [subcommand]

SUBCOMMANDS
  status      Show daemon and session status (default)
  start       Start the daemon supervisor
  stop        Stop the daemon
  bg          Start a background session
  attach      Attach to a background session
  logs        Show session logs
  kill        Kill a session
  help        Show this help

REPL
  /daemon [subcommand]    Same commands available in interactive mode

OPTIONS (for start)
  --dir <path>              Working directory (default: current)
  --spawn-mode <mode>       Worker spawn mode: same-dir | worktree (default: same-dir)
  --capacity <N>            Max concurrent sessions per worker (default: 4)
  --permission-mode <mode>  Permission mode for spawned sessions
  --sandbox                 Enable sandbox mode
  --name <name>             Session name
  -h, --help                Show this help
`),
  )
}

/**
 * Show unified status: daemon supervisor + background sessions.
 */
async function showUnifiedStatus(): Promise<void> {
  // 1. Daemon supervisor status
  const result = queryDaemonStatus()
  console.log(t('=== Daemon Supervisor ==='))
  switch (result.status) {
    case 'running': {
      const s = result.state!
      console.log(tf('  Status:  running', {}))
      console.log(tf('  PID:     {pid}', { pid: s.pid }))
      console.log(tf('  CWD:     {cwd}', { cwd: s.cwd }))
      console.log(tf('  Started: {startedAt}', { startedAt: s.startedAt }))
      console.log(
        tf('  Workers: {workers}', { workers: s.workerKinds.join(', ') }),
      )
      break
    }
    case 'stopped':
      console.log(t('  Status: stopped'))
      break
    case 'stale':
      console.log(t('  Status: stale (cleaned up)'))
      break
  }

  // 2. Background sessions
  console.log(t('\n=== Background Sessions ==='))
  const bg = await import('../cli/bg.js')
  await bg.psHandler([])
}

/**
 * Stop a running daemon from another CLI process.
 */
async function handleDaemonStop(): Promise<void> {
  const result = queryDaemonStatus()

  if (result.status === 'stopped') {
    console.log(t('daemon is not running'))
    return
  }

  if (result.status === 'stale') {
    console.log(t('daemon was stale (cleaned up)'))
    return
  }

  console.log(tf('stopping daemon (PID: {pid})...', { pid: result.state!.pid }))
  const stopped = await stopDaemonByPid()

  if (stopped) {
    console.log(t('daemon stopped'))
  } else {
    console.log(t('daemon could not be stopped (may have already exited)'))
  }
}

/**
 * Parse supervisor arguments from CLI.
 */
function parseSupervisorArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--dir' && i + 1 < args.length) {
      result.dir = resolve(args[++i]!)
    } else if (arg.startsWith('--dir=')) {
      result.dir = resolve(arg.slice('--dir='.length))
    } else if (arg === '--spawn-mode' && i + 1 < args.length) {
      result.spawnMode = args[++i]!
    } else if (arg.startsWith('--spawn-mode=')) {
      result.spawnMode = arg.slice('--spawn-mode='.length)
    } else if (arg === '--capacity' && i + 1 < args.length) {
      result.capacity = args[++i]!
    } else if (arg.startsWith('--capacity=')) {
      result.capacity = arg.slice('--capacity='.length)
    } else if (arg === '--permission-mode' && i + 1 < args.length) {
      result.permissionMode = args[++i]!
    } else if (arg.startsWith('--permission-mode=')) {
      result.permissionMode = arg.slice('--permission-mode='.length)
    } else if (arg === '--sandbox') {
      result.sandbox = '1'
    } else if (arg === '--name' && i + 1 < args.length) {
      result.name = args[++i]!
    } else if (arg.startsWith('--name=')) {
      result.name = arg.slice('--name='.length)
    }
  }
  return result
}

/**
 * Run the daemon supervisor loop. Spawns workers and restarts them
 * on crash with exponential backoff.
 */
async function runSupervisor(args: string[]): Promise<void> {
  const config = parseSupervisorArgs(args)
  const dir = config.dir || resolve('.')

  console.log(tf('[daemon] supervisor starting in {dir}', { dir }))

  const workers: WorkerState[] = [
    {
      kind: 'remoteControl',
      process: null,
      backoffMs: BACKOFF_INITIAL_MS,
      failureCount: 0,
      parked: false,
      lastStartTime: 0,
      restartTimer: null,
    },
  ]

  // Write daemon state file so other CLI processes can query/stop us
  writeDaemonState({
    pid: process.pid,
    cwd: dir,
    startedAt: new Date().toISOString(),
    workerKinds: workers.map(w => w.kind),
    lastStatus: 'running',
  })

  const controller = new AbortController()
  let shutdownChildren: ChildProcess[] = []

  // Graceful shutdown
  const shutdown = () => {
    if (controller.signal.aborted) return
    console.log(t('[daemon] supervisor shutting down...'))
    // Capture before aborting: worker exit handlers clear worker.process.
    shutdownChildren = workers.flatMap(worker =>
      worker.process ? [worker.process] : [],
    )
    for (const w of workers) {
      if (w.restartTimer) {
        clearTimeout(w.restartTimer)
        w.restartTimer = null
      }
    }
    controller.abort()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  // Spawn and supervise workers
  for (const worker of workers) {
    if (!controller.signal.aborted) {
      spawnWorker(worker, dir, config, controller.signal)
    }
  }

  // Wait for abort signal
  await new Promise<void>(resolve => {
    if (controller.signal.aborted) {
      resolve()
      return
    }
    controller.signal.addEventListener('abort', () => resolve(), { once: true })
  })

  // Stop complete worker process trees and do not report success until their
  // exits are confirmed. Each worker can own bridge session/tool descendants.
  const terminationResults = await Promise.all(
    shutdownChildren.map(child => terminateWorkerProcess(child)),
  )
  const allWorkersStopped = terminationResults.every(stopped => stopped)

  if (!allWorkersStopped) {
    console.error(t('[daemon] a worker process tree could not be stopped'))
    process.exitCode = 1
    // Keep the state file and never print "stopped" without confirmation.
    return
  }

  process.off('SIGTERM', shutdown)
  process.off('SIGINT', shutdown)
  removeDaemonState()
  console.log(t('[daemon] supervisor stopped'))
}

async function terminateWorkerProcess(child: ChildProcess): Promise<boolean> {
  const pid = child.pid
  if (!pid) return child.exitCode !== null || child.signalCode !== null

  // Workers can own nested process groups, so a root exit event is not tree
  // proof. Snapshot descendant identities and confirm every original member.
  return terminateProcessTree(pid, {
    graceMs: WORKER_SHUTDOWN_GRACE_MS,
    forceWaitMs: WORKER_FORCE_KILL_WAIT_MS,
    onSignalError: (signal, error) => {
      console.error(
        `[daemon] failed to send ${signal} to worker PID ${pid}: ${String(error)}`,
      )
    },
  })
}

/**
 * Spawn a worker child process with the appropriate env vars.
 */
function spawnWorker(
  worker: WorkerState,
  dir: string,
  config: Record<string, string>,
  signal: AbortSignal,
): void {
  if (signal.aborted || worker.parked) return

  worker.lastStartTime = Date.now()

  const env: Record<string, string | undefined> = {
    ...process.env,
    DAEMON_WORKER_DIR: dir,
    DAEMON_WORKER_NAME: config.name,
    DAEMON_WORKER_SPAWN_MODE: config.spawnMode || 'same-dir',
    DAEMON_WORKER_CAPACITY: config.capacity || '4',
    DAEMON_WORKER_PERMISSION: config.permissionMode,
    DAEMON_WORKER_SANDBOX: config.sandbox || '0',
    DAEMON_WORKER_CREATE_SESSION: '1',
    CLAUDE_CODE_SESSION_KIND: 'daemon-worker',
  }

  console.log(tf("[daemon] spawning worker '{kind}'", { kind: worker.kind }))

  const launch = buildCliLaunch([`--daemon-worker=${worker.kind}`], { env })

  const child = spawnCli(launch, {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Isolate the worker in a POSIX process group. Bridge sessions use their
    // own groups and are terminated by the worker before its exit is reported.
    detached: process.platform !== 'win32',
  })

  worker.process = child

  // Pipe worker stdout/stderr to supervisor with prefix
  child.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().trimEnd().split('\n')
    for (const line of lines) {
      console.log(`  ${line}`)
    }
  })
  child.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().trimEnd().split('\n')
    for (const line of lines) {
      console.error(`  ${line}`)
    }
  })

  child.on('exit', (code, sig) => {
    worker.process = null

    if (signal.aborted) {
      // Supervisor is shutting down, don't restart
      return
    }

    if (code === EXIT_CODE_PERMANENT) {
      console.error(
        tf("[daemon] worker '{kind}' exited with permanent error — parking", {
          kind: worker.kind,
        }),
      )
      worker.parked = true
      return
    }

    // Check for rapid failure (crashed within 10s of starting)
    const runDuration = Date.now() - worker.lastStartTime
    if (runDuration < 10_000) {
      worker.failureCount++
      if (worker.failureCount >= MAX_RAPID_FAILURES) {
        console.error(
          tf(
            "[daemon] worker '{kind}' failed {count} times rapidly — parking",
            { kind: worker.kind, count: worker.failureCount },
          ),
        )
        worker.parked = true
        return
      }
    } else {
      // Ran for a reasonable time, reset failure count
      worker.failureCount = 0
      worker.backoffMs = BACKOFF_INITIAL_MS
    }

    console.log(
      tf(
        "[daemon] worker '{kind}' exited (code={code}, signal={sig}), restarting in {backoffMs}ms",
        {
          kind: worker.kind,
          code: String(code),
          sig: String(sig),
          backoffMs: worker.backoffMs,
        },
      ),
    )

    worker.restartTimer = setTimeout(() => {
      worker.restartTimer = null
      if (!signal.aborted && !worker.parked) {
        spawnWorker(worker, dir, config, signal)
      }
    }, worker.backoffMs)
    worker.restartTimer.unref?.()

    // Exponential backoff
    worker.backoffMs = Math.min(
      worker.backoffMs * BACKOFF_MULTIPLIER,
      BACKOFF_CAP_MS,
    )
  })
}
