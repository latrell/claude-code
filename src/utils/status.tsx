import chalk from 'chalk';
import figures from 'figures';
import * as React from 'react';
import { color, Text } from '@anthropic/ink';
import { t, tf } from '../i18n/t.js';
import type { MCPServerConnection } from '../services/mcp/types.js';
import { getAccountInformation, isClaudeAISubscriber } from './auth.js';
import { getLargeMemoryFiles, getMemoryFiles, MAX_MEMORY_CHARACTER_COUNT } from './claudemd.js';
import { getDoctorDiagnostic } from './doctorDiagnostic.js';
import { getAWSRegion, getDefaultVertexRegion, isEnvTruthy } from './envUtils.js';
import { getDisplayPath } from './file.js';
import { formatNumber } from './format.js';
import { getIdeClientName, type IDEExtensionInstallationStatus, isJetBrainsIde, toIDEDisplayName } from './ide.js';
import { getClaudeAiUserDefaultModelDescription, modelDisplayString } from './model/model.js';
import { getAPIProvider } from './model/providers.js';
import { getMTLSConfig } from './mtls.js';
import { checkInstall } from './nativeInstaller/index.js';
import { getProxyUrl } from './proxy.js';
import { SandboxManager } from './sandbox/sandbox-adapter.js';
import { getSettingsWithAllErrors } from './settings/allErrors.js';
import { getEnabledSettingSources, getSettingSourceDisplayNameCapitalized } from './settings/constants.js';
import { getManagedFileSettingsPresence, getPolicySettingsOrigin, getSettingsForSource } from './settings/settings.js';
import type { ThemeName } from './theme.js';

export type Property = {
  label?: string;
  value: React.ReactNode | Array<string>;
};

export type Diagnostic = React.ReactNode;

export function buildSandboxProperties(): Property[] {
  if (process.env.USER_TYPE !== 'ant') {
    return [];
  }

  const isSandboxed = SandboxManager.isSandboxingEnabled();

  return [
    {
      label: t('Bash Sandbox'),
      value: isSandboxed ? t('Enabled') : t('Disabled'),
    },
  ];
}

export function buildIDEProperties(
  mcpClients: MCPServerConnection[],
  ideInstallationStatus: IDEExtensionInstallationStatus | null = null,
  theme: ThemeName,
): Property[] {
  const ideClient = mcpClients?.find(client => client.name === 'ide');

  if (ideInstallationStatus) {
    const ideName = toIDEDisplayName(ideInstallationStatus.ideType);
    const pluginOrExtension = isJetBrainsIde(ideInstallationStatus.ideType) ? t('plugin') : t('extension');

    if (ideInstallationStatus.error) {
      return [
        {
          label: t('IDE'),
          value: (
            <Text>
              {color('error', theme)(figures.cross)}{' '}
              {tf('Error installing {ideName} {type}: {error}', {
                ideName,
                type: pluginOrExtension,
                error: ideInstallationStatus.error,
              })}
              {'\n'}
              {t('Please restart your IDE and try again.')}
            </Text>
          ),
        },
      ];
    }

    if (ideInstallationStatus.installed) {
      if (ideClient && ideClient.type === 'connected') {
        if (ideInstallationStatus.installedVersion !== ideClient.serverInfo?.version) {
          return [
            {
              label: t('IDE'),
              value: tf('Connected to {ideName} {type} version {version} (server version: {serverVersion})', {
                ideName,
                type: pluginOrExtension,
                version: ideInstallationStatus.installedVersion,
                serverVersion: ideClient.serverInfo?.version,
              }),
            },
          ];
        } else {
          return [
            {
              label: t('IDE'),
              value: tf('Connected to {ideName} {type} version {version}', {
                ideName,
                type: pluginOrExtension,
                version: ideInstallationStatus.installedVersion,
              }),
            },
          ];
        }
      } else {
        return [
          {
            label: t('IDE'),
            value: tf('Installed {ideName} {type}', {
              ideName,
              type: pluginOrExtension,
            }),
          },
        ];
      }
    }
  } else if (ideClient) {
    const ideName = getIdeClientName(ideClient) ?? 'IDE';
    if (ideClient.type === 'connected') {
      return [
        {
          label: t('IDE'),
          value: tf('Connected to {ideName} extension', { ideName }),
        },
      ];
    } else {
      return [
        {
          label: t('IDE'),
          value: `${color('error', theme)(figures.cross)} ${tf('Not connected to {ideName}', { ideName })}`,
        },
      ];
    }
  }

  return [];
}

export function buildMcpProperties(clients: MCPServerConnection[] = [], theme: ThemeName): Property[] {
  const servers = clients.filter(client => client.name !== 'ide');
  if (!servers.length) {
    return [];
  }

  // Summary instead of a full server list — 20+ servers wrapped onto many
  // rows, dominating the Status pane. Show counts by state + /mcp hint.
  const byState = { connected: 0, pending: 0, needsAuth: 0, failed: 0 };
  for (const s of servers) {
    if (s.type === 'connected') byState.connected++;
    else if (s.type === 'pending') byState.pending++;
    else if (s.type === 'needs-auth') byState.needsAuth++;
    else byState.failed++;
  }
  const parts: string[] = [];
  if (byState.connected) parts.push(color('success', theme)(tf('{n} connected', { n: byState.connected })));
  if (byState.needsAuth) parts.push(color('warning', theme)(tf('{n} need auth', { n: byState.needsAuth })));
  if (byState.pending) parts.push(color('inactive', theme)(tf('{n} pending', { n: byState.pending })));
  if (byState.failed) parts.push(color('error', theme)(tf('{n} failed', { n: byState.failed })));

  return [
    {
      label: t('MCP servers'),
      value: `${parts.join(', ')} ${color('inactive', theme)('· /mcp')}`,
    },
  ];
}

export async function buildMemoryDiagnostics(): Promise<Diagnostic[]> {
  const files = await getMemoryFiles();
  const largeFiles = getLargeMemoryFiles(files);

  const diagnostics: Diagnostic[] = [];

  largeFiles.forEach(file => {
    const displayPath = getDisplayPath(file.path);
    diagnostics.push(
      tf('Large {path} will impact performance ({size} chars > {max})', {
        path: displayPath,
        size: formatNumber(file.content.length),
        max: formatNumber(MAX_MEMORY_CHARACTER_COUNT),
      }),
    );
  });

  return diagnostics;
}

export function buildSettingSourcesProperties(): Property[] {
  const enabledSources = getEnabledSettingSources();

  // Filter to only sources that actually have settings loaded
  const sourcesWithSettings = enabledSources.filter(source => {
    const settings = getSettingsForSource(source);
    return settings !== null && Object.keys(settings).length > 0;
  });

  // Map internal names to user-friendly names
  // For policySettings, distinguish between remote and local (or skip if neither exists)
  const sourceNames = sourcesWithSettings
    .map(source => {
      if (source === 'policySettings') {
        const origin = getPolicySettingsOrigin();
        if (origin === null) {
          return null; // Skip - no policy settings exist
        }
        switch (origin) {
          case 'remote':
            return t('Enterprise managed settings (remote)');
          case 'plist':
            return t('Enterprise managed settings (plist)');
          case 'hklm':
            return t('Enterprise managed settings (HKLM)');
          case 'file': {
            const { hasBase, hasDropIns } = getManagedFileSettingsPresence();
            if (hasBase && hasDropIns) {
              return t('Enterprise managed settings (file + drop-ins)');
            }
            if (hasDropIns) {
              return t('Enterprise managed settings (drop-ins)');
            }
            return t('Enterprise managed settings (file)');
          }
          case 'hkcu':
            return t('Enterprise managed settings (HKCU)');
        }
      }
      return getSettingSourceDisplayNameCapitalized(source);
    })
    .filter((name): name is string => name !== null);

  return [
    {
      label: t('Setting sources'),
      value: sourceNames,
    },
  ];
}

export async function buildInstallationDiagnostics(): Promise<Diagnostic[]> {
  const installWarnings = await checkInstall();
  return installWarnings.map(warning => warning.message);
}

export async function buildInstallationHealthDiagnostics(): Promise<Diagnostic[]> {
  const diagnostic = await getDoctorDiagnostic();
  const items: Diagnostic[] = [];

  const { errors: validationErrors } = getSettingsWithAllErrors();
  if (validationErrors.length > 0) {
    const invalidFiles = Array.from(new Set(validationErrors.map(error => error.file)));
    const fileList = invalidFiles.join(', ');

    items.push(tf('Found invalid settings files: {files}. They will be ignored.', { files: fileList }));
  }

  // Add warnings from doctor diagnostic (includes leftover installations, config mismatches, etc.)
  diagnostic.warnings.forEach(warning => {
    items.push(warning.issue);
  });

  if (diagnostic.hasUpdatePermissions === false) {
    items.push(t('No write permissions for auto-updates (requires sudo)'));
  }

  return items;
}

export function buildAccountProperties(): Property[] {
  const accountInfo = getAccountInformation();
  if (!accountInfo) {
    return [];
  }

  const properties: Property[] = [];

  if (accountInfo.subscription) {
    properties.push({
      label: t('Login method'),
      value: tf('{plan} Account', { plan: accountInfo.subscription }),
    });
  }

  if (accountInfo.tokenSource) {
    properties.push({
      label: t('Auth token'),
      value: accountInfo.tokenSource,
    });
  }

  if (accountInfo.apiKeySource) {
    properties.push({
      label: t('API key'),
      value: accountInfo.apiKeySource,
    });
  }

  // Hide sensitive account info in demo mode
  if (accountInfo.organization && !process.env.IS_DEMO) {
    properties.push({
      label: t('Organization'),
      value: accountInfo.organization,
    });
  }
  if (accountInfo.email && !process.env.IS_DEMO) {
    properties.push({
      label: t('Email'),
      value: accountInfo.email,
    });
  }

  return properties;
}

export function buildAPIProviderProperties(): Property[] {
  const apiProvider = getAPIProvider();

  const properties: Property[] = [];

  if (apiProvider !== 'firstParty') {
    const providerLabel = {
      bedrock: t('AWS Bedrock'),
      vertex: t('Google Vertex AI'),
      foundry: t('Microsoft Foundry'),
      gemini: t('Gemini API'),
      grok: t('Grok API'),
      openai: t('OpenAI API'),
      cursor: t('Cursor API'),
    }[apiProvider];
    properties.push({
      label: t('API provider'),
      value: providerLabel,
    });
  }

  if (apiProvider === 'firstParty') {
    const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
    if (anthropicBaseUrl) {
      properties.push({
        label: t('Anthropic base URL'),
        value: anthropicBaseUrl,
      });
    }
  } else if (apiProvider === 'bedrock') {
    const bedrockBaseUrl = process.env.BEDROCK_BASE_URL;
    if (bedrockBaseUrl) {
      properties.push({
        label: t('Bedrock base URL'),
        value: bedrockBaseUrl,
      });
    }

    properties.push({
      label: t('AWS region'),
      value: getAWSRegion(),
    });

    if (isEnvTruthy(process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH)) {
      properties.push({
        value: t('AWS auth skipped'),
      });
    }
  } else if (apiProvider === 'vertex') {
    const vertexBaseUrl = process.env.VERTEX_BASE_URL;
    if (vertexBaseUrl) {
      properties.push({
        label: t('Vertex base URL'),
        value: vertexBaseUrl,
      });
    }

    const gcpProject = process.env.ANTHROPIC_VERTEX_PROJECT_ID;
    if (gcpProject) {
      properties.push({
        label: t('GCP project'),
        value: gcpProject,
      });
    }

    properties.push({
      label: t('Default region'),
      value: getDefaultVertexRegion(),
    });

    if (isEnvTruthy(process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH)) {
      properties.push({
        value: t('GCP auth skipped'),
      });
    }
  } else if (apiProvider === 'foundry') {
    const foundryBaseUrl = process.env.ANTHROPIC_FOUNDRY_BASE_URL;
    if (foundryBaseUrl) {
      properties.push({
        label: t('Microsoft Foundry base URL'),
        value: foundryBaseUrl,
      });
    }

    const foundryResource = process.env.ANTHROPIC_FOUNDRY_RESOURCE;
    if (foundryResource) {
      properties.push({
        label: t('Microsoft Foundry resource'),
        value: foundryResource,
      });
    }

    if (isEnvTruthy(process.env.CLAUDE_CODE_SKIP_FOUNDRY_AUTH)) {
      properties.push({
        value: t('Microsoft Foundry auth skipped'),
      });
    }
  } else if (apiProvider === 'gemini') {
    const geminiBaseUrl = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
    properties.push({
      label: t('Gemini base URL'),
      value: geminiBaseUrl,
    });
  } else if (apiProvider === 'grok') {
    const grokBaseUrl = process.env.GROK_BASE_URL;
    properties.push({
      label: t('Grok base URL'),
      value: grokBaseUrl,
    });
  } else if (apiProvider === 'openai') {
    const openaiBaseUrl = process.env.OPENAI_BASE_URL;
    properties.push({
      label: t('OpenAI base URL'),
      value: openaiBaseUrl,
    });
  }

  const proxyUrl = getProxyUrl();
  if (proxyUrl) {
    properties.push({
      label: t('Proxy'),
      value: proxyUrl,
    });
  }

  const mtlsConfig = getMTLSConfig();
  if (process.env.NODE_EXTRA_CA_CERTS) {
    properties.push({
      label: t('Additional CA cert(s)'),
      value: process.env.NODE_EXTRA_CA_CERTS,
    });
  }
  if (mtlsConfig) {
    if (mtlsConfig.cert && process.env.CLAUDE_CODE_CLIENT_CERT) {
      properties.push({
        label: t('mTLS client cert'),
        value: process.env.CLAUDE_CODE_CLIENT_CERT,
      });
    }

    if (mtlsConfig.key && process.env.CLAUDE_CODE_CLIENT_KEY) {
      properties.push({
        label: t('mTLS client key'),
        value: process.env.CLAUDE_CODE_CLIENT_KEY,
      });
    }
  }

  return properties;
}

export function getModelDisplayLabel(mainLoopModel: string | null): string {
  let modelLabel = modelDisplayString(mainLoopModel);

  if (mainLoopModel === null && isClaudeAISubscriber()) {
    const description = getClaudeAiUserDefaultModelDescription();

    modelLabel = `${chalk.bold(t('Default'))} ${description}`;
  }

  return modelLabel;
}
