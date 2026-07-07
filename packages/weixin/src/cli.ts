import {
  clearAccount,
  DEFAULT_BASE_URL,
  loadAccount,
  saveAccount,
} from './accounts.js'
import { startLogin, waitForLogin } from './login.js'
import { confirmPairing } from './pairing.js'
import { runWeixinMcpServer } from './server.js'
import type { WeixinServerDeps } from './server.js'
import { t, tf } from 'src/i18n/t.js'

function printUsage(): void {
  process.stdout.write(
    t(
      'Usage:\n  ccb weixin serve\n  ccb weixin login\n  ccb weixin login clear\n  ccb weixin access pair <code>\n\nSession enablement:\n  ccb --channels plugin:weixin@builtin',
    ) + '\n',
  )
}

async function runLogin(clear = false): Promise<void> {
  if (clear) {
    clearAccount()
    process.stdout.write(t('WeChat account cleared.') + '\n')
    return
  }

  const existing = loadAccount()
  if (existing) {
    process.stdout.write(
      tf(
        'Already connected:\n  User ID: {userId}\n  Connected since: {savedAt}\n\nRun `ccb weixin login clear` to disconnect.\nRestart Claude Code with:\n  ccb --channels plugin:weixin@builtin',
        {
          userId: existing.userId || 'unknown',
          savedAt: existing.savedAt,
        },
      ) + '\n',
    )
    return
  }

  process.stdout.write(t('Starting WeChat QR login...') + '\n\n')
  const qr = await startLogin(DEFAULT_BASE_URL)
  process.stdout.write(
    tf('\n{scanPrompt}\n{url}\n\n', {
      scanPrompt: t('Scan the QR code above with WeChat, or open this URL:'),
      url: qr.qrcodeUrl || '',
    }),
  )

  const result = await waitForLogin({
    qrcodeId: qr.qrcodeId,
    apiBaseUrl: DEFAULT_BASE_URL,
  })

  if (!result.connected || !result.token) {
    process.stderr.write(
      tf('Login failed: {message}', { message: result.message }) + '\n',
    )
    process.exit(1)
  }

  saveAccount({
    token: result.token,
    baseUrl: result.baseUrl || DEFAULT_BASE_URL,
    userId: result.userId,
    savedAt: new Date().toISOString(),
  })

  process.stdout.write(
    tf(
      'Connected successfully!\n  User ID: {userId}\n  Base URL: {baseUrl}\n\nRestart Claude Code with:\n  ccb --channels plugin:weixin@builtin',
      {
        userId: result.userId || 'unknown',
        baseUrl: result.baseUrl || DEFAULT_BASE_URL,
      },
    ) + '\n',
  )
}

function runAccess(args: string[]): void {
  if (args[0] !== 'pair' || !args[1]) {
    printUsage()
    process.exit(1)
  }

  const userId = confirmPairing(args[1])
  if (!userId) {
    process.stderr.write(t('Invalid or expired pairing code.') + '\n')
    process.exit(1)
  }

  process.stdout.write(tf('Paired successfully: {userId}', { userId }) + '\n')
}

export async function handleWeixinCli(
  args: string[],
  serverDeps?: WeixinServerDeps,
  version?: string,
): Promise<void> {
  const [subcommand, ...rest] = args

  switch (subcommand) {
    case 'serve':
      if (!serverDeps) {
        process.stderr.write(
          t('[weixin] serve handler not available in this context.') + '\n',
        )
        process.exit(1)
      }
      await runWeixinMcpServer(version ?? '0.0.0', serverDeps)
      return
    case 'login':
      await runLogin(rest[0] === 'clear')
      return
    case 'access':
      runAccess(rest)
      return
    default:
      printUsage()
  }
}
