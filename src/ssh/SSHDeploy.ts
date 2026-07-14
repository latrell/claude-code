import { existsSync } from 'fs'
import { resolve } from 'path'
import { logForDebugging } from 'src/utils/debug.js'
import type { Subprocess } from 'bun'
import { terminateSSHProcess } from './terminateSSHProcess.js'

const SSH_TIMEOUT_MS = 60_000
const REMOTE_BIN_DIR = '~/.local/bin'
const REMOTE_CLI_FILE = 'claude-code-cli.js'
const REMOTE_WRAPPER = 'claude'
const POST_TERMINATION_EXIT_WAIT_MS = 1_000

export interface DeployOptions {
  host: string
  remotePlatform: string
  remoteArch: string
  localVersion: string
  onProgress?: (msg: string) => void
}

type SSHProcessTerminator = (proc: Subprocess) => Promise<boolean>

export async function waitForSSHProcessExit(
  proc: Subprocess,
  timeoutMs: number,
  terminateProcess: SSHProcessTerminator = terminateSSHProcess,
): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let outcome: { type: 'exit'; exitCode: number } | { type: 'timeout' }
  try {
    outcome = await Promise.race([
      proc.exited.then(exitCode => ({ type: 'exit' as const, exitCode })),
      new Promise<{ type: 'timeout' }>(resolveTimeout => {
        timer = setTimeout(() => resolveTimeout({ type: 'timeout' }), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }

  if (outcome.type === 'exit') return outcome.exitCode

  let confirmed = false
  try {
    confirmed = await terminateProcess(proc)
  } catch (error) {
    throw new Error(
      `SSH process timed out after ${timeoutMs}ms and cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!confirmed) {
    throw new Error(
      `SSH process timed out after ${timeoutMs}ms; process-tree termination could not be confirmed`,
    )
  }

  // Identity-based tree confirmation is authoritative, but Bun's exited
  // promise is also part of the local subprocess lifecycle. Do not report the
  // timeout until both have settled.
  let exitTimer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      proc.exited,
      new Promise<never>((_resolve, reject) => {
        exitTimer = setTimeout(
          () =>
            reject(
              new Error(
                'SSH process tree terminated but subprocess exit did not settle',
              ),
            ),
          POST_TERMINATION_EXIT_WAIT_MS,
        )
      }),
    ])
  } finally {
    if (exitTimer) clearTimeout(exitTimer)
  }
  throw new Error(`SSH process timed out after ${timeoutMs}ms`)
}

async function runSshCommand(
  host: string,
  command: string,
  timeoutMs = SSH_TIMEOUT_MS,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['ssh', '-o', 'ConnectTimeout=10', host, command], {
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    waitForSSHProcessExit(proc, timeoutMs),
  ])
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode }
}

function findLocalBinary(): string {
  const projectRoot = resolve(import.meta.dir, '../..')
  const distPath = resolve(projectRoot, 'dist/cli.js')
  if (existsSync(distPath)) return distPath

  const devPath = resolve(projectRoot, 'src/entrypoints/cli.tsx')
  if (existsSync(devPath)) return devPath

  throw new Error(
    'Cannot find local CLI binary to deploy. Run `bun run build` first.',
  )
}

export async function deployBinary(options: DeployOptions): Promise<string> {
  const { host, remotePlatform, remoteArch, localVersion, onProgress } = options

  if (remotePlatform !== 'linux' && remotePlatform !== 'darwin') {
    throw new Error(
      `Remote platform "${remotePlatform}" is not supported. Only linux and darwin are supported.`,
    )
  }

  logForDebugging(
    `[SSHDeploy] deploying to ${host} (${remotePlatform}/${remoteArch}, v${localVersion})`,
  )

  const localBinary = findLocalBinary()
  logForDebugging(`[SSHDeploy] local binary: ${localBinary}`)

  onProgress?.('Creating remote directory...')
  const mkdirResult = await runSshCommand(host, `mkdir -p ${REMOTE_BIN_DIR}`)
  if (mkdirResult.exitCode !== 0) {
    throw new Error(`Failed to create remote directory: ${mkdirResult.stderr}`)
  }

  onProgress?.('Uploading binary...')
  const remotePath = `${REMOTE_BIN_DIR}/${REMOTE_CLI_FILE}`
  const scpProc = Bun.spawn(
    ['scp', '-o', 'ConnectTimeout=10', localBinary, `${host}:${remotePath}`],
    { stdout: 'pipe', stderr: 'pipe' },
  )
  const [, scpStderr, scpExit] = await Promise.all([
    new Response(scpProc.stdout).text(),
    new Response(scpProc.stderr).text(),
    waitForSSHProcessExit(scpProc, SSH_TIMEOUT_MS),
  ])

  if (scpExit !== 0) {
    throw new Error(`SCP upload failed (exit ${scpExit}): ${scpStderr.trim()}`)
  }

  onProgress?.('Installing wrapper script...')
  const wrapperScript = [
    `cat > ${REMOTE_BIN_DIR}/${REMOTE_WRAPPER} << 'WRAPPER'`,
    '#!/bin/sh',
    `exec bun ${REMOTE_BIN_DIR}/${REMOTE_CLI_FILE} "$@"`,
    'WRAPPER',
    `chmod +x ${REMOTE_BIN_DIR}/${REMOTE_WRAPPER}`,
  ].join('\n')

  const wrapperResult = await runSshCommand(host, wrapperScript)
  if (wrapperResult.exitCode !== 0) {
    throw new Error(`Failed to install wrapper script: ${wrapperResult.stderr}`)
  }

  onProgress?.('Verifying installation...')
  const verifyResult = await runSshCommand(
    host,
    `${REMOTE_BIN_DIR}/${REMOTE_WRAPPER} --version`,
  )
  if (verifyResult.exitCode !== 0) {
    throw new Error(
      `Binary deployed but verification failed (exit ${verifyResult.exitCode}): ${verifyResult.stderr}`,
    )
  }

  logForDebugging(
    `[SSHDeploy] deployed successfully, remote version: ${verifyResult.stdout}`,
  )
  onProgress?.(`Deployed v${verifyResult.stdout}`)

  return `${REMOTE_BIN_DIR}/${REMOTE_WRAPPER}`
}
