import figures from 'figures';
import { join } from 'path';
import React, { Suspense, use, useCallback, useEffect, useMemo, useState } from 'react';
import { KeybindingWarnings } from 'src/components/KeybindingWarnings.js';
import { McpParsingWarnings } from 'src/components/mcp/McpParsingWarnings.js';
import { getModelMaxOutputTokens } from 'src/utils/context.js';
import { getClaudeConfigHomeDir } from 'src/utils/envUtils.js';
import type { SettingSource } from 'src/utils/settings/constants.js';
import { getOriginalCwd } from '../bootstrap/state.js';
import type { CommandResultDisplay } from '../commands.js';
import { Pane } from '@anthropic/ink';
import { PressEnterToContinue } from '../components/PressEnterToContinue.js';
import { SandboxDoctorSection } from '../components/sandbox/SandboxDoctorSection.js';
import { ValidationErrorsList } from '../components/ValidationErrorsList.js';
import { useSettingsErrors } from '../hooks/notifs/useSettingsErrors.js';
import { useExitOnCtrlCDWithKeybindings } from '../hooks/useExitOnCtrlCDWithKeybindings.js';
import { Box, Text } from '@anthropic/ink';
import { useKeybindings } from '../keybindings/useKeybinding.js';
import { useAppState } from '../state/AppState.js';
import { T } from '../i18n/TText.js';
import { t, tf } from '../i18n/t.js';
import { getPluginErrorMessage } from '../types/plugin.js';
import { getGcsDistTags, getNpmDistTags, type NpmDistTags } from '../utils/autoUpdater.js';
import { type ContextWarnings, checkContextWarnings } from '../utils/doctorContextWarnings.js';
import { type DiagnosticInfo, getDoctorDiagnostic } from '../utils/doctorDiagnostic.js';
import { validateBoundedIntEnvVar } from '../utils/envValidation.js';
import { pathExists } from '../utils/file.js';
import {
  cleanupStaleLocks,
  getAllLockInfo,
  isPidBasedLockingEnabled,
  type LockInfo,
} from '../utils/nativeInstaller/pidLock.js';
import { getInitialSettings } from '../utils/settings/settings.js';
import { BASH_MAX_OUTPUT_DEFAULT, BASH_MAX_OUTPUT_UPPER_LIMIT } from '../utils/shell/outputLimits.js';
import { TASK_MAX_OUTPUT_DEFAULT, TASK_MAX_OUTPUT_UPPER_LIMIT } from '../utils/task/outputFormatting.js';
import { getXDGStateHome } from '../utils/xdg.js';

type Props = {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
};

type AgentInfo = {
  activeAgents: Array<{
    agentType: string;
    source: SettingSource | 'built-in' | 'plugin';
  }>;
  userAgentsDir: string;
  projectAgentsDir: string;
  userDirExists: boolean;
  projectDirExists: boolean;
  failedFiles?: Array<{ path: string; error: string }>;
};

type VersionLockInfo = {
  enabled: boolean;
  locks: LockInfo[];
  locksDir: string;
  staleLocksCleaned: number;
};

function DistTagsDisplay({ promise }: { promise: Promise<NpmDistTags> }): React.ReactNode {
  const distTags = use(promise);
  if (!distTags.latest) {
    return <Text dimColor>{tf('└ Failed to fetch versions', {})}</Text>;
  }
  return (
    <>
      {distTags.stable && <Text>{tf('└ Stable version: {version}', { version: String(distTags.stable) })}</Text>}
      <Text>{tf('└ Latest version: {version}', { version: String(distTags.latest) })}</Text>
    </>
  );
}

export function Doctor({ onDone }: Props): React.ReactNode {
  const agentDefinitions = useAppState(s => s.agentDefinitions);
  const mcpTools = useAppState(s => s.mcp.tools);
  const toolPermissionContext = useAppState(s => s.toolPermissionContext);
  const pluginsErrors = useAppState(s => s.plugins.errors);
  useExitOnCtrlCDWithKeybindings();

  const tools = useMemo(() => {
    return mcpTools || [];
  }, [mcpTools]);

  const [diagnostic, setDiagnostic] = useState<DiagnosticInfo | null>(null);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [contextWarnings, setContextWarnings] = useState<ContextWarnings | null>(null);
  const [versionLockInfo, setVersionLockInfo] = useState<VersionLockInfo | null>(null);
  const validationErrors = useSettingsErrors();

  // Create promise once for dist-tags fetch (depends on diagnostic)
  const distTagsPromise = useMemo(
    () =>
      getDoctorDiagnostic().then(diag => {
        const fetchDistTags = diag.installationType === 'native' ? getGcsDistTags : getNpmDistTags;
        return fetchDistTags().catch(() => ({ latest: null, stable: null }));
      }),
    [],
  );
  const autoUpdatesChannel = getInitialSettings()?.autoUpdatesChannel ?? 'latest';

  const errorsExcludingMcp = validationErrors.filter(error => error.mcpErrorMetadata === undefined);

  const envValidationErrors = useMemo(() => {
    const envVars = [
      {
        name: 'BASH_MAX_OUTPUT_LENGTH',
        default: BASH_MAX_OUTPUT_DEFAULT,
        upperLimit: BASH_MAX_OUTPUT_UPPER_LIMIT,
      },
      {
        name: 'TASK_MAX_OUTPUT_LENGTH',
        default: TASK_MAX_OUTPUT_DEFAULT,
        upperLimit: TASK_MAX_OUTPUT_UPPER_LIMIT,
      },
      {
        name: 'CLAUDE_CODE_MAX_OUTPUT_TOKENS',
        // Check for values against the latest supported model
        ...getModelMaxOutputTokens('claude-opus-4-7'),
      },
    ];
    return envVars
      .map(v => {
        const value = process.env[v.name];
        const result = validateBoundedIntEnvVar(v.name, value, v.default, v.upperLimit);
        return { name: v.name, ...result };
      })
      .filter(v => v.status !== 'valid');
  }, []);

  useEffect(() => {
    void getDoctorDiagnostic().then(setDiagnostic);

    void (async () => {
      const userAgentsDir = join(getClaudeConfigHomeDir(), 'agents');
      const projectAgentsDir = join(getOriginalCwd(), '.claude', 'agents');

      const { activeAgents, allAgents, failedFiles } = agentDefinitions;

      const [userDirExists, projectDirExists] = await Promise.all([
        pathExists(userAgentsDir),
        pathExists(projectAgentsDir),
      ]);

      const agentInfoData = {
        activeAgents: activeAgents.map(a => ({
          agentType: a.agentType,
          source: a.source,
        })),
        userAgentsDir,
        projectAgentsDir,
        userDirExists,
        projectDirExists,
        failedFiles,
      };
      setAgentInfo(agentInfoData);

      const warnings = await checkContextWarnings(
        tools,
        {
          activeAgents,
          allAgents,
          failedFiles,
        },
        async () => toolPermissionContext,
      );
      setContextWarnings(warnings);

      // Fetch version lock info if PID-based locking is enabled
      if (isPidBasedLockingEnabled()) {
        const locksDir = join(getXDGStateHome(), 'claude', 'locks');
        const staleLocksCleaned = cleanupStaleLocks(locksDir);
        const locks = getAllLockInfo(locksDir);
        setVersionLockInfo({
          enabled: true,
          locks,
          locksDir,
          staleLocksCleaned,
        });
      } else {
        setVersionLockInfo({
          enabled: false,
          locks: [],
          locksDir: '',
          staleLocksCleaned: 0,
        });
      }
    })();
  }, [toolPermissionContext, tools, agentDefinitions]);

  const handleDismiss = useCallback(() => {
    onDone(t('Claude Code diagnostics dismissed'), { display: 'system' });
  }, [onDone]);

  // Handle dismiss via keybindings (Enter, Escape, or Ctrl+C)
  useKeybindings(
    {
      'confirm:yes': handleDismiss,
      'confirm:no': handleDismiss,
    },
    { context: 'Confirmation' },
  );

  // Loading state
  if (!diagnostic) {
    return (
      <Pane>
        <T dimColor>Checking installation status…</T>
      </Pane>
    );
  }

  // Compute search mode label
  const ripgrepMode =
    diagnostic.ripgrepStatus.mode === 'embedded'
      ? 'bundled'
      : diagnostic.ripgrepStatus.mode === 'builtin'
        ? 'vendor'
        : diagnostic.ripgrepStatus.systemPath || 'system';

  // Compute auto-updates status
  const autoUpdatesStatus = diagnostic.packageManager ? t('Managed by package manager') : diagnostic.autoUpdates;

  // Format the diagnostic output according to spec
  return (
    <Pane>
      <Box flexDirection="column">
        <T bold>Diagnostics</T>
        <Text>
          {tf('└ Currently running: {type} ({version})', {
            type: diagnostic.installationType,
            version: diagnostic.version,
          })}
        </Text>
        {diagnostic.packageManager && <Text>{tf('└ Package manager: {pm}', { pm: diagnostic.packageManager })}</Text>}
        <Text>{tf('└ Path: {path}', { path: diagnostic.installationPath })}</Text>
        <Text>{tf('└ Invoked: {binary}', { binary: diagnostic.invokedBinary })}</Text>
        <Text>
          {tf('└ Config install method: {method}', {
            method: diagnostic.configInstallMethod,
          })}
        </Text>
        <Text>
          {tf('└ Search: {status} ({mode})', {
            status: diagnostic.ripgrepStatus.working ? 'OK' : 'Not working',
            mode: ripgrepMode,
          })}
        </Text>
        {diagnostic.ripgrepStatus.note && (
          <Text color="warning">{tf('└ Note: {note}', { note: diagnostic.ripgrepStatus.note })}</Text>
        )}

        {/* Show recommendation if auto-updates are disabled */}
        {diagnostic.recommendation && (
          <>
            <Text></Text>
            <Text color="warning">
              {tf('Recommendation: {text}', {
                text: diagnostic.recommendation.split('\n')[0]!,
              })}
            </Text>
            <Text dimColor>{diagnostic.recommendation.split('\n')[1]}</Text>
          </>
        )}

        {/* Show multiple installations warning */}
        {diagnostic.multipleInstallations.length > 1 && (
          <>
            <Text></Text>
            <Text color="warning">
              <T>Warning: Multiple installations found</T>
            </Text>
            {diagnostic.multipleInstallations.map((install, i) => (
              <Text key={i}>
                └ {install.type} at {install.path}
              </Text>
            ))}
          </>
        )}

        {/* Show configuration warnings */}
        {diagnostic.warnings.length > 0 && (
          <>
            <Text></Text>
            {diagnostic.warnings.map((warning, i) => (
              <Box key={i} flexDirection="column">
                <Text color="warning">{tf('Warning: {issue}', { issue: warning.issue })}</Text>
                <Text>{tf('Fix: {fix}', { fix: warning.fix })}</Text>
              </Box>
            ))}
          </>
        )}

        {/* Show invalid settings errors */}
        {errorsExcludingMcp.length > 0 && (
          <Box flexDirection="column" marginTop={1} marginBottom={1}>
            <T bold>Invalid Settings</T>
            <ValidationErrorsList errors={errorsExcludingMcp} />
          </Box>
        )}
      </Box>

      {/* Updates section */}
      <Box flexDirection="column">
        <T bold>Updates</T>
        <Text>{tf('└ Auto-updates: {status}', { status: autoUpdatesStatus })}</Text>
        {diagnostic.hasUpdatePermissions !== null && (
          <Text>
            {tf('└ Update permissions: {status}', {
              status: diagnostic.hasUpdatePermissions ? 'Yes' : 'No (requires sudo)',
            })}
          </Text>
        )}
        <Text>
          {tf('└ Auto-update channel: {channel}', {
            channel: autoUpdatesChannel,
          })}
        </Text>
        <Suspense fallback={null}>
          <DistTagsDisplay promise={distTagsPromise} />
        </Suspense>
      </Box>

      <SandboxDoctorSection />

      <McpParsingWarnings />

      <KeybindingWarnings />

      {/* Environment Variables */}
      {envValidationErrors.length > 0 && (
        <Box flexDirection="column">
          <T bold>Environment Variables</T>
          {envValidationErrors.map((validation, i) => (
            <Text key={i}>
              └ {validation.name}:{' '}
              <Text color={validation.status === 'capped' ? 'warning' : 'error'}>{validation.message}</Text>
            </Text>
          ))}
        </Box>
      )}

      {/* Version Locks (PID-based locking) */}
      {versionLockInfo?.enabled && (
        <Box flexDirection="column">
          <T bold>Version Locks</T>
          {versionLockInfo.staleLocksCleaned > 0 && (
            <Text dimColor>
              {tf('└ Cleaned {count} stale lock(s)', {
                count: versionLockInfo.staleLocksCleaned,
              })}
            </Text>
          )}
          {versionLockInfo.locks.length === 0 ? (
            <T dimColor>└ No active version locks</T>
          ) : (
            versionLockInfo.locks.map((lock, i) => (
              <Text key={i}>
                └{' '}
                {tf('{version}: PID {pid}', {
                  version: lock.version,
                  pid: lock.pid,
                })}{' '}
                {lock.isProcessRunning ? (
                  <T>(running)</T>
                ) : (
                  <Text color="warning">
                    <T>(stale)</T>
                  </Text>
                )}
              </Text>
            ))
          )}
        </Box>
      )}

      {agentInfo?.failedFiles && agentInfo.failedFiles.length > 0 && (
        <Box flexDirection="column">
          <T bold color="error">
            Agent Parse Errors
          </T>
          <Text color="error">
            {tf('└ Failed to parse {count} agent file(s):', {
              count: agentInfo.failedFiles.length,
            })}
          </Text>
          {agentInfo.failedFiles.map((file, i) => (
            <Text key={i} dimColor>
              {'  '}└ {file.path}: {file.error}
            </Text>
          ))}
        </Box>
      )}

      {/* Plugin Errors */}
      {pluginsErrors.length > 0 && (
        <Box flexDirection="column">
          <T bold color="error">
            Plugin Errors
          </T>
          <Text color="error">
            {tf('└ {count} plugin error(s) detected:', {
              count: pluginsErrors.length,
            })}
          </Text>
          {pluginsErrors.map((error, i) => (
            <Text key={i} dimColor>
              {'  '}└ {error.source || 'unknown'}
              {'plugin' in error && error.plugin ? ` [${error.plugin}]` : ''}: {getPluginErrorMessage(error)}
            </Text>
          ))}
        </Box>
      )}

      {/* Unreachable Permission Rules Warning */}
      {contextWarnings?.unreachableRulesWarning && (
        <Box flexDirection="column">
          <T bold color="warning">
            Unreachable Permission Rules
          </T>
          <Text>
            └{' '}
            <Text color="warning">
              {figures.warning} {contextWarnings.unreachableRulesWarning.message}
            </Text>
          </Text>
          {contextWarnings.unreachableRulesWarning.details.map((detail, i) => (
            <Text key={i} dimColor>
              {'  '}└ {detail}
            </Text>
          ))}
        </Box>
      )}

      {/* Context Usage Warnings */}
      {contextWarnings &&
        (contextWarnings.claudeMdWarning || contextWarnings.agentWarning || contextWarnings.mcpWarning) && (
          <Box flexDirection="column">
            <T bold>Context Usage Warnings</T>

            {contextWarnings.claudeMdWarning && (
              <>
                <Text>
                  └{' '}
                  <Text color="warning">
                    {figures.warning} {contextWarnings.claudeMdWarning.message}
                  </Text>
                </Text>
                <Text>
                  {'  '}└ <T>Files:</T>
                </Text>
                {contextWarnings.claudeMdWarning.details.map((detail, i) => (
                  <Text key={i} dimColor>
                    {'    '}└ {detail}
                  </Text>
                ))}
              </>
            )}

            {contextWarnings.agentWarning && (
              <>
                <Text>
                  └{' '}
                  <Text color="warning">
                    {figures.warning} {contextWarnings.agentWarning.message}
                  </Text>
                </Text>
                <Text>
                  {'  '}└ <T>Top contributors:</T>
                </Text>
                {contextWarnings.agentWarning.details.map((detail, i) => (
                  <Text key={i} dimColor>
                    {'    '}└ {detail}
                  </Text>
                ))}
              </>
            )}

            {contextWarnings.mcpWarning && (
              <>
                <Text>
                  └{' '}
                  <Text color="warning">
                    {figures.warning} {contextWarnings.mcpWarning.message}
                  </Text>
                </Text>
                <Text>
                  {'  '}└ <T>MCP servers:</T>
                </Text>
                {contextWarnings.mcpWarning.details.map((detail, i) => (
                  <Text key={i} dimColor>
                    {'    '}└ {detail}
                  </Text>
                ))}
              </>
            )}
          </Box>
        )}

      <Box>
        <PressEnterToContinue />
      </Box>
    </Pane>
  );
}
