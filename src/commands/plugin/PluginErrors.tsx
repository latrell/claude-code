import { t, tf } from '../../i18n/t.js';
import { getPluginErrorMessage, type PluginError } from '../../types/plugin.js';

export function formatErrorMessage(error: PluginError): string {
  switch (error.type) {
    case 'path-not-found':
      return tf('{component} path not found: {path}', { component: error.component, path: error.path });
    case 'git-auth-failed':
      return tf('Git {authType} authentication failed for {url}', {
        authType: error.authType.toUpperCase(),
        url: error.gitUrl,
      });
    case 'git-timeout':
      return tf('Git {operation} timed out for {url}', { operation: error.operation, url: error.gitUrl });
    case 'network-error':
      return error.details
        ? tf('Network error accessing {url}: {details}', { url: error.url, details: error.details })
        : tf('Network error accessing {url}', { url: error.url });
    case 'manifest-parse-error':
      return tf('Failed to parse manifest at {path}: {parseError}', {
        path: error.manifestPath,
        parseError: error.parseError,
      });
    case 'manifest-validation-error':
      return tf('Invalid manifest at {path}: {errors}', {
        path: error.manifestPath,
        errors: error.validationErrors.join(', '),
      });
    case 'plugin-not-found':
      return tf('Plugin "{pluginId}" not found in marketplace "{marketplace}"', {
        pluginId: error.pluginId,
        marketplace: error.marketplace,
      });
    case 'marketplace-not-found':
      return tf('Marketplace "{marketplace}" not found', { marketplace: error.marketplace });
    case 'marketplace-load-failed':
      return tf('Failed to load marketplace "{marketplace}": {reason}', {
        marketplace: error.marketplace,
        reason: error.reason,
      });
    case 'mcp-config-invalid':
      return tf('Invalid MCP server config for "{serverName}": {validationError}', {
        serverName: error.serverName,
        validationError: error.validationError,
      });
    case 'mcp-server-suppressed-duplicate': {
      const dup = error.duplicateOf.startsWith('plugin:')
        ? tf('server provided by plugin "{plugin}"', { plugin: error.duplicateOf.split(':')[1] ?? '?' })
        : tf('already-configured "{name}"', { name: error.duplicateOf });
      return tf('MCP server "{serverName}" skipped — same command/URL as {dup}', { serverName: error.serverName, dup });
    }
    case 'hook-load-failed':
      return tf('Failed to load hooks from {hookPath}: {reason}', { hookPath: error.hookPath, reason: error.reason });
    case 'component-load-failed':
      return tf('Failed to load {component} from {path}: {reason}', {
        component: error.component,
        path: error.path,
        reason: error.reason,
      });
    case 'mcpb-download-failed':
      return tf('Failed to download MCPB from {url}: {reason}', { url: error.url, reason: error.reason });
    case 'mcpb-extract-failed':
      return tf('Failed to extract MCPB {mcpbPath}: {reason}', { mcpbPath: error.mcpbPath, reason: error.reason });
    case 'mcpb-invalid-manifest':
      return tf('MCPB manifest invalid at {mcpbPath}: {validationError}', {
        mcpbPath: error.mcpbPath,
        validationError: error.validationError,
      });
    case 'marketplace-blocked-by-policy':
      return error.blockedByBlocklist
        ? tf('Marketplace "{marketplace}" is blocked by enterprise policy', { marketplace: error.marketplace })
        : tf('Marketplace "{marketplace}" is not in the allowed marketplace list', { marketplace: error.marketplace });
    case 'dependency-unsatisfied':
      return error.reason === 'not-enabled'
        ? tf('Dependency "{dependency}" is disabled', { dependency: error.dependency })
        : tf('Dependency "{dependency}" is not installed', { dependency: error.dependency });
    case 'lsp-config-invalid':
      return tf('Invalid LSP server config for "{serverName}": {validationError}', {
        serverName: error.serverName,
        validationError: error.validationError,
      });
    case 'lsp-server-start-failed':
      return tf('LSP server "{serverName}" failed to start: {reason}', {
        serverName: error.serverName,
        reason: error.reason,
      });
    case 'lsp-server-crashed':
      return error.signal
        ? tf('LSP server "{serverName}" crashed with signal {signal}', {
            serverName: error.serverName,
            signal: error.signal,
          })
        : tf('LSP server "{serverName}" crashed with exit code {exitCode}', {
            serverName: error.serverName,
            exitCode: error.exitCode ?? 'unknown',
          });
    case 'lsp-request-timeout':
      return tf('LSP server "{serverName}" timed out on {method} after {timeoutMs}ms', {
        serverName: error.serverName,
        method: error.method,
        timeoutMs: error.timeoutMs,
      });
    case 'lsp-request-failed':
      return tf('LSP server "{serverName}" {method} failed: {error}', {
        serverName: error.serverName,
        method: error.method,
        error: error.error,
      });
    case 'plugin-cache-miss':
      return tf('Plugin "{plugin}" not cached at {installPath}', {
        plugin: error.plugin,
        installPath: error.installPath,
      });
    case 'generic-error':
      return error.error;
  }
  const _exhaustive: never = error;
  return getPluginErrorMessage(_exhaustive);
}

export function getErrorGuidance(error: PluginError): string | null {
  switch (error.type) {
    case 'path-not-found':
      return t('Check that the path in your manifest or marketplace config is correct');
    case 'git-auth-failed':
      return error.authType === 'ssh'
        ? t('Configure SSH keys or use HTTPS URL instead')
        : t('Configure credentials or use SSH URL instead');
    case 'git-timeout':
    case 'network-error':
      return t('Check your internet connection and try again');
    case 'manifest-parse-error':
      return t('Check manifest file syntax in the plugin directory');
    case 'manifest-validation-error':
      return t('Check manifest file follows the required schema');
    case 'plugin-not-found':
      return tf('Plugin may not exist in marketplace "{marketplace}"', { marketplace: error.marketplace });
    case 'marketplace-not-found':
      return error.availableMarketplaces.length > 0
        ? tf('Available marketplaces: {list}', { list: error.availableMarketplaces.join(', ') })
        : t('Add the marketplace first using /plugin marketplace add');
    case 'mcp-config-invalid':
      return t('Check MCP server configuration in .mcp.json or manifest');
    case 'mcp-server-suppressed-duplicate': {
      // duplicateOf is "plugin:name:srv" when another plugin won dedup —
      // users can't remove plugin-provided servers from their MCP config,
      // so point them at the winning plugin instead.
      if (error.duplicateOf.startsWith('plugin:')) {
        const winningPlugin = error.duplicateOf.split(':')[1] ?? 'the other plugin';
        return tf('Disable plugin "{plugin}" if you want this plugin\'s version instead', { plugin: winningPlugin });
      }
      return tf('Remove "{name}" from your MCP config if you want the plugin\'s version instead', {
        name: error.duplicateOf,
      });
    }
    case 'hook-load-failed':
      return t('Check hooks.json file syntax and structure');
    case 'component-load-failed':
      return tf('Check {component} directory structure and file permissions', { component: error.component });
    case 'mcpb-download-failed':
      return t('Check your internet connection and URL accessibility');
    case 'mcpb-extract-failed':
      return t('Verify the MCPB file is valid and not corrupted');
    case 'mcpb-invalid-manifest':
      return t('Contact the plugin author about the invalid manifest');
    case 'marketplace-blocked-by-policy':
      if (error.blockedByBlocklist) {
        return t('This marketplace source is explicitly blocked by your administrator');
      }
      return error.allowedSources.length > 0
        ? tf('Allowed sources: {list}', { list: error.allowedSources.join(', ') })
        : t('Contact your administrator to configure allowed marketplace sources');
    case 'dependency-unsatisfied':
      return error.reason === 'not-enabled'
        ? tf('Enable "{dependency}" or uninstall "{plugin}"', { dependency: error.dependency, plugin: error.plugin })
        : tf('Install "{dependency}" or uninstall "{plugin}"', { dependency: error.dependency, plugin: error.plugin });
    case 'lsp-config-invalid':
      return t('Check LSP server configuration in the plugin manifest');
    case 'lsp-server-start-failed':
    case 'lsp-server-crashed':
    case 'lsp-request-timeout':
    case 'lsp-request-failed':
      return t('Check LSP server logs with --debug for details');
    case 'plugin-cache-miss':
      return t('Run /plugins to refresh the plugin cache');
    case 'marketplace-load-failed':
    case 'generic-error':
      return null;
  }
  const _exhaustive: never = error;
  return null;
}
