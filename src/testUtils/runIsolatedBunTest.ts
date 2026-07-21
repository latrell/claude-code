import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'

type CapturedStream = {
  text: string
  error?: unknown
}

export type RunIsolatedBunTestOptions = {
  label: string
  suiteUrl: URL
  timeoutMs: number
  cwd?: string
  env?: NodeJS.ProcessEnv
  testArgs?: readonly string[]
}

export type IsolatedBunTestResult = {
  exitCode: number
  stdout: string
  stderr: string
  output: string
}

function captureStream(read: Promise<string>): Promise<CapturedStream> {
  return read.then(
    text => ({ text }),
    error => ({ text: '', error }),
  )
}

function describeError(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error)
}

function formatCommand(command: string[]): string {
  return command.map(argument => JSON.stringify(argument)).join(' ')
}

/**
 * Run a mock-heavy Bun test suite in a fresh process without blocking the
 * parent test runner's event loop. Both output pipes are consumed immediately
 * and concurrently, and timeout cleanup does not return until the child exits
 * and both pipes reach EOF.
 */
export async function runIsolatedBunTest(
  options: RunIsolatedBunTestOptions,
): Promise<IsolatedBunTestResult> {
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error(`Invalid isolated test timeout: ${options.timeoutMs}`)
  }

  const cwd = options.cwd ?? process.cwd()
  const suitePath = fileURLToPath(options.suiteUrl)
  const suiteArg = `./${relative(cwd, suitePath).replaceAll('\\', '/')}`
  const command = [
    process.execPath,
    'test',
    ...(options.testArgs ?? []),
    suiteArg,
  ]
  const startedAt = Date.now()
  const child = Bun.spawn(command, {
    cwd,
    env: options.env ?? process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  // Start draining both pipes before waiting for exit. Waiting first can
  // deadlock when either pipe fills its OS buffer.
  const stdoutPromise = captureStream(new Response(child.stdout).text())
  const stderrPromise = captureStream(new Response(child.stderr).text())

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<{ type: 'timeout' }>(resolve => {
    timeoutHandle = setTimeout(
      () => resolve({ type: 'timeout' }),
      options.timeoutMs,
    )
  })
  const exitPromise = child.exited.then(exitCode => ({
    type: 'exit' as const,
    exitCode,
  }))

  let firstResult: Awaited<typeof exitPromise> | { type: 'timeout' }
  try {
    firstResult = await Promise.race([exitPromise, timeoutPromise])
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
  }

  let timedOut = false
  let killError: unknown
  let exitCode: number
  if (firstResult.type === 'timeout') {
    timedOut = true
    try {
      child.kill(9)
    } catch (error) {
      killError = error
    }
    // Even after a kill error, the process may have won the timeout race by a
    // few microtasks. Await the canonical exit promise in every timeout path.
    exitCode = await child.exited
  } else {
    exitCode = firstResult.exitCode
  }

  const [stdoutResult, stderrResult] = await Promise.all([
    stdoutPromise,
    stderrPromise,
  ])
  const stdout = stdoutResult.text
  const stderr = stderrResult.text
  const output = `${stdout}${stderr}`
  const elapsedMs = Date.now() - startedAt

  if (
    timedOut ||
    exitCode !== 0 ||
    stdoutResult.error !== undefined ||
    stderrResult.error !== undefined
  ) {
    const details = [
      `exitCode=${exitCode}`,
      `signalCode=${String(child.signalCode)}`,
      `timedOut=${String(timedOut)}`,
      `timeoutMs=${options.timeoutMs}`,
      `elapsedMs=${elapsedMs}`,
      `cwd=${cwd}`,
      `command=${formatCommand(command)}`,
      `killError=${killError === undefined ? 'none' : describeError(killError)}`,
      `stdoutReadError=${stdoutResult.error === undefined ? 'none' : describeError(stdoutResult.error)}`,
      `stderrReadError=${stderrResult.error === undefined ? 'none' : describeError(stderrResult.error)}`,
    ].join(', ')
    throw new Error(
      `${options.label} failed (${details}):\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`,
    )
  }

  return { exitCode, stdout, stderr, output }
}
