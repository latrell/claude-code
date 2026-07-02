/**
 * `ccb update` — Check and install the latest version of claude-code-best.
 *
 * Detection strategy:
 *  1. If `bun` is available and the current installation was done via bun → use `bun update -g`
 *  2. Otherwise → use `npm install -g`
 */
import chalk from 'chalk'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { t, tf } from '../i18n/t.js'
import { logForDebugging } from '../utils/debug.js'
import { distRoot } from '../utils/distRoot.js'
import { execFileNoThrowWithCwd } from '../utils/execFileNoThrow.js'
import { gracefulShutdown } from '../utils/gracefulShutdown.js'
import { writeToStdout } from '../utils/process.js'

const PACKAGE_NAME = 'claude-code-best'

function getCurrentVersion(): string {
  // Read version from the nearest package.json (walks up from dist root)
  try {
    const pkgPath = join(distRoot, '..', 'package.json')
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      if (pkg.version) return pkg.version
    }
  } catch {
    // fallback
  }
  return MACRO.VERSION
}

function isCommandAvailable(cmd: string): boolean {
  try {
    execSync(`which ${cmd} 2>/dev/null`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/**
 * Detect whether the current installation was done via bun.
 * Checks if the binary path contains "bun" or if bun's global install dir has our package.
 */
function isBunInstallation(): boolean {
  // Check if the running binary is under bun's global install path
  const execPath = process.execPath
  if (execPath.includes('bun')) {
    return true
  }

  // Check bun's global install directory
  const bunGlobalDir = join(homedir(), '.bun', 'install', 'global')
  if (existsSync(join(bunGlobalDir, 'node_modules', PACKAGE_NAME))) {
    return true
  }

  return false
}

/**
 * Get the latest version from npm registry.
 */
async function getLatestVersion(): Promise<string | null> {
  const result = await execFileNoThrowWithCwd(
    'npm',
    ['view', `${PACKAGE_NAME}@latest`, 'version', '--prefer-online'],
    { abortSignal: AbortSignal.timeout(10_000), cwd: homedir() },
  )
  if (result.code !== 0) {
    logForDebugging(`npm view failed: ${result.stderr}`)
    return null
  }
  return result.stdout.trim()
}

/**
 * Compare two semver strings. Returns true if a >= b.
 */
function gte(a: string, b: string): boolean {
  const parseVer = (v: string) => v.replace(/^\D/, '').split('.').map(Number)
  const pa = parseVer(a)
  const pb = parseVer(b)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false
  }
  return true
}

export async function updateCCB(): Promise<void> {
  const currentVersion = getCurrentVersion()
  writeToStdout(
    tf('Current version: {version}', { version: currentVersion }) + '\n',
  )

  // Determine package manager
  const hasBun = isCommandAvailable('bun')
  const useBun = isBunInstallation()
  const pkgManager = useBun && hasBun ? 'bun' : 'npm'

  writeToStdout(tf('Package manager: {pm}', { pm: pkgManager }) + '\n')
  writeToStdout(t('Checking for updates...') + '\n')

  // Get latest version
  const latestVersion = await getLatestVersion()
  if (!latestVersion) {
    process.stderr.write(chalk.red(t('Failed to check for updates')) + '\n')
    process.stderr.write(
      t('Unable to fetch latest version from npm registry.') + '\n',
    )
    await gracefulShutdown(1)
    return
  }

  // Already up to date?
  if (latestVersion === currentVersion || gte(currentVersion, latestVersion)) {
    writeToStdout(
      chalk.green(
        tf('ccb is up to date ({version})', { version: currentVersion }),
      ) + '\n',
    )
    await gracefulShutdown(0)
    return
  }

  writeToStdout(
    tf('New version available: {latest} (current: {current})', {
      latest: latestVersion,
      current: currentVersion,
    }) + '\n',
  )
  writeToStdout(tf('Installing update via {pm}...', { pm: pkgManager }) + '\n')

  try {
    if (pkgManager === 'bun') {
      execSync(`bun install -g ${PACKAGE_NAME}@latest`, {
        stdio: 'inherit',
        cwd: homedir(),
        timeout: 120_000,
      })
    } else {
      execSync(`npm install -g ${PACKAGE_NAME}@latest`, {
        stdio: 'inherit',
        cwd: homedir(),
        timeout: 120_000,
      })
    }

    writeToStdout(
      chalk.green(
        tf('Successfully updated from {old} to {new}', {
          old: currentVersion,
          new: latestVersion,
        }),
      ) + '\n',
    )
  } catch (error) {
    process.stderr.write(chalk.red(t('Update failed')) + '\n')
    process.stderr.write(`${error}\n`)
    process.stderr.write('\n')
    process.stderr.write(t('Try manually updating with:') + '\n')
    if (pkgManager === 'bun') {
      process.stderr.write(
        chalk.bold(`  bun install -g ${PACKAGE_NAME}@latest`) + '\n',
      )
    } else {
      process.stderr.write(
        chalk.bold(`  npm install -g ${PACKAGE_NAME}@latest`) + '\n',
      )
    }
    await gracefulShutdown(1)
  }

  await gracefulShutdown(0)
}
