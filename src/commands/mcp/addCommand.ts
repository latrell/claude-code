/**
 * MCP add CLI subcommand
 *
 * Extracted from main.tsx to enable direct testing.
 */
import { type Command, Option } from '@commander-js/extra-typings'
import { cliError, cliOk } from '../../cli/exit.js'
import { t, tf } from '../../i18n/t.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import {
  readClientSecret,
  saveMcpClientSecret,
} from '../../services/mcp/auth.js'
import { addMcpConfig } from '../../services/mcp/config.js'
import {
  describeMcpConfigFilePath,
  ensureConfigScope,
  ensureTransport,
  parseHeaders,
} from '../../services/mcp/utils.js'
import {
  getXaaIdpSettings,
  isXaaEnabled,
} from '../../services/mcp/xaaIdpLogin.js'
import { parseEnvVars } from '../../utils/envUtils.js'
import { jsonStringify } from '../../utils/slowOperations.js'

/**
 * Registers the `mcp add` subcommand on the given Commander command.
 */
export function registerMcpAddCommand(mcp: Command): void {
  mcp
    .command('add <name> <commandOrUrl> [args...]')
    .description(
      t('Add an MCP server to Claude Code.') +
        '\n\n' +
        t('Examples:') +
        '\n' +
        '  # ' +
        t('Add HTTP server:') +
        '\n' +
        '  claude mcp add --transport http sentry https://mcp.sentry.dev/mcp\n\n' +
        '  # ' +
        t('Add HTTP server with headers:') +
        '\n' +
        '  claude mcp add --transport http corridor https://app.corridor.dev/api/mcp --header "Authorization: Bearer ..."\n\n' +
        '  # ' +
        t('Add stdio server with environment variables:') +
        '\n' +
        '  claude mcp add -e API_KEY=xxx my-server -- npx my-mcp-server\n\n' +
        '  # ' +
        t('Add stdio server with subprocess flags:') +
        '\n' +
        '  claude mcp add my-server -- my-command --some-flag arg1',
    )
    .option(
      '-s, --scope <scope>',
      t('Configuration scope (local, user, or project)'),
      'local',
    )
    .option(
      '-t, --transport <transport>',
      t(
        'Transport type (stdio, sse, http). Defaults to stdio if not specified.',
      ),
    )
    .option(
      '-e, --env <env...>',
      t('Set environment variables (e.g. -e KEY=value)'),
    )
    .option(
      '-H, --header <header...>',
      t(
        'Set WebSocket headers (e.g. -H "X-Api-Key: abc123" -H "X-Custom: value")',
      ),
    )
    .option('--client-id <clientId>', t('OAuth client ID for HTTP/SSE servers'))
    .option(
      '--client-secret',
      t('Prompt for OAuth client secret (or set MCP_CLIENT_SECRET env var)'),
    )
    .option(
      '--callback-port <port>',
      t(
        'Fixed port for OAuth callback (for servers requiring pre-registered redirect URIs)',
      ),
    )
    .helpOption('-h, --help', t('Display help for command'))
    .addOption(
      new Option(
        '--xaa',
        t(
          "Enable XAA (SEP-990) for this server. Requires 'claude mcp xaa setup' first. Also requires --client-id and --client-secret (for the MCP server's AS).",
        ),
      ).hideHelp(!isXaaEnabled()),
    )
    .action(async (name, commandOrUrl, args, options) => {
      // Commander.js handles -- natively: it consumes -- and everything after becomes args
      const actualCommand = commandOrUrl
      const actualArgs = args

      // If no name is provided, error
      if (!name) {
        cliError(
          t('Error: Server name is required.') +
            '\n' +
            t('Usage: claude mcp add <name> <command> [args...]'),
        )
      } else if (!actualCommand) {
        cliError(
          t('Error: Command is required when server name is provided.') +
            '\n' +
            t('Usage: claude mcp add <name> <command> [args...]'),
        )
      }

      try {
        const scope = ensureConfigScope(options.scope)
        const transport = ensureTransport(options.transport)

        // XAA fail-fast: validate at add-time, not auth-time.
        if (options.xaa && !isXaaEnabled()) {
          cliError(
            t(
              'Error: --xaa requires CLAUDE_CODE_ENABLE_XAA=1 in your environment',
            ),
          )
        }
        const xaa = Boolean(options.xaa)
        if (xaa) {
          const missing: string[] = []
          if (!options.clientId) missing.push('--client-id')
          if (!options.clientSecret) missing.push('--client-secret')
          if (!getXaaIdpSettings()) {
            missing.push(
              t("'claude mcp xaa setup' (settings.xaaIdp not configured)"),
            )
          }
          if (missing.length) {
            cliError(
              tf('Error: --xaa requires: {items}', {
                items: missing.join(', '),
              }),
            )
          }
        }

        // Check if transport was explicitly provided
        const transportExplicit = options.transport !== undefined

        // Check if the command looks like a URL (likely incorrect usage)
        const looksLikeUrl =
          actualCommand.startsWith('http://') ||
          actualCommand.startsWith('https://') ||
          actualCommand.startsWith('localhost') ||
          actualCommand.endsWith('/sse') ||
          actualCommand.endsWith('/mcp')

        logEvent('tengu_mcp_add', {
          type: transport as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          scope:
            scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          source:
            'command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          transport:
            transport as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          transportExplicit: transportExplicit,
          looksLikeUrl: looksLikeUrl,
        })

        if (transport === 'sse') {
          if (!actualCommand) {
            cliError(t('Error: URL is required for SSE transport.'))
          }

          const headers = options.header
            ? parseHeaders(options.header)
            : undefined

          const callbackPort = options.callbackPort
            ? parseInt(options.callbackPort, 10)
            : undefined
          const oauth =
            options.clientId || callbackPort || xaa
              ? {
                  ...(options.clientId ? { clientId: options.clientId } : {}),
                  ...(callbackPort ? { callbackPort } : {}),
                  ...(xaa ? { xaa: true } : {}),
                }
              : undefined

          const clientSecret =
            options.clientSecret && options.clientId
              ? await readClientSecret()
              : undefined

          const serverConfig = {
            type: 'sse' as const,
            url: actualCommand,
            headers,
            oauth,
          }
          await addMcpConfig(name, serverConfig, scope)

          if (clientSecret) {
            saveMcpClientSecret(name, serverConfig, clientSecret)
          }

          process.stdout.write(
            tf(
              'Added SSE MCP server {name} with URL: {url} to {scope} config\n',
              { name, url: actualCommand, scope },
            ),
          )
          if (headers) {
            process.stdout.write(
              `Headers: ${jsonStringify(headers, null, 2)}\n`,
            )
          }
        } else if (transport === 'http') {
          if (!actualCommand) {
            cliError(t('Error: URL is required for HTTP transport.'))
          }

          const headers = options.header
            ? parseHeaders(options.header)
            : undefined

          const callbackPort = options.callbackPort
            ? parseInt(options.callbackPort, 10)
            : undefined
          const oauth =
            options.clientId || callbackPort || xaa
              ? {
                  ...(options.clientId ? { clientId: options.clientId } : {}),
                  ...(callbackPort ? { callbackPort } : {}),
                  ...(xaa ? { xaa: true } : {}),
                }
              : undefined

          const clientSecret =
            options.clientSecret && options.clientId
              ? await readClientSecret()
              : undefined

          const serverConfig = {
            type: 'http' as const,
            url: actualCommand,
            headers,
            oauth,
          }
          await addMcpConfig(name, serverConfig, scope)

          if (clientSecret) {
            saveMcpClientSecret(name, serverConfig, clientSecret)
          }

          process.stdout.write(
            tf(
              'Added HTTP MCP server {name} with URL: {url} to {scope} config\n',
              { name, url: actualCommand, scope },
            ),
          )
          if (headers) {
            process.stdout.write(
              `Headers: ${jsonStringify(headers, null, 2)}\n`,
            )
          }
        } else {
          if (
            options.clientId ||
            options.clientSecret ||
            options.callbackPort ||
            options.xaa
          ) {
            process.stderr.write(
              t(
                'Warning: --client-id, --client-secret, --callback-port, and --xaa are only supported for HTTP/SSE transports and will be ignored for stdio.',
              ) + '\n',
            )
          }

          // Warn if this looks like a URL but transport wasn't explicitly specified
          if (!transportExplicit && looksLikeUrl) {
            process.stderr.write(
              tf(
                '\nWarning: The command "{command}" looks like a URL, but is being interpreted as a stdio server as --transport was not specified.\n',
                { command: actualCommand },
              ),
            )
            process.stderr.write(
              tf(
                'If this is an HTTP server, use: claude mcp add --transport http {name} {command}\n',
                { name, command: actualCommand },
              ),
            )
            process.stderr.write(
              tf(
                'If this is an SSE server, use: claude mcp add --transport sse {name} {command}\n',
                { name, command: actualCommand },
              ),
            )
          }

          const env = parseEnvVars(options.env)
          await addMcpConfig(
            name,
            { type: 'stdio', command: actualCommand, args: actualArgs, env },
            scope,
          )

          process.stdout.write(
            tf(
              'Added stdio MCP server {name} with command: {cmd} {args} to {scope} config\n',
              { name, cmd: actualCommand, args: actualArgs.join(' '), scope },
            ),
          )
        }
        cliOk(
          tf('File modified: {path}', {
            path: describeMcpConfigFilePath(scope),
          }),
        )
      } catch (error) {
        cliError((error as Error).message)
      }
    })
}
