import * as React from 'react';
import { Box, Text } from '@anthropic/ink';
import { SandboxManager, shouldAllowManagedSandboxDomainsOnly } from '../../utils/sandbox/sandbox-adapter.js';
import { t } from '../../i18n/t.js';
import { T } from '../../i18n/TText.js';

export function SandboxConfigTab(): React.ReactNode {
  const isEnabled = SandboxManager.isSandboxingEnabled();

  // Show warnings (e.g., seccomp not available on Linux)
  const depCheck = SandboxManager.checkDependencies();
  const warningsNote =
    depCheck.warnings.length > 0 ? (
      <Box marginTop={1} flexDirection="column">
        {depCheck.warnings.map((w, i) => (
          <Text key={i} dimColor>
            {w}
          </Text>
        ))}
      </Box>
    ) : null;

  if (!isEnabled) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <T color="subtle">Sandbox is not enabled</T>
        {warningsNote}
      </Box>
    );
  }

  const fsReadConfig = SandboxManager.getFsReadConfig();
  const fsWriteConfig = SandboxManager.getFsWriteConfig();
  const networkConfig = SandboxManager.getNetworkRestrictionConfig();
  const allowUnixSockets = SandboxManager.getAllowUnixSockets();
  const excludedCommands = SandboxManager.getExcludedCommands();
  const globPatternWarnings = SandboxManager.getLinuxGlobPatternWarnings();

  return (
    <Box flexDirection="column" paddingY={1}>
      {/* Excluded Commands */}
      <Box flexDirection="column">
        <Text bold color="permission">
          Excluded Commands:
        </Text>
        <Text dimColor>{excludedCommands.length > 0 ? excludedCommands.join(', ') : t('None')}</Text>
      </Box>

      {/* Filesystem Read Restrictions */}
      {fsReadConfig.denyOnly.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color="permission">
            Filesystem Read Restrictions:
          </Text>
          <T dimColor vars={{ list: fsReadConfig.denyOnly.join(', ') }}>
            Denied: {list}
          </T>
          {fsReadConfig.allowWithinDeny && fsReadConfig.allowWithinDeny.length > 0 && (
            <T dimColor vars={{ list: fsReadConfig.allowWithinDeny.join(', ') }}>
              Allowed within denied: {list}
            </T>
          )}
        </Box>
      )}

      {/* Filesystem Write Restrictions */}
      {fsWriteConfig.allowOnly.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color="permission">
            Filesystem Write Restrictions:
          </Text>
          <T dimColor vars={{ list: fsWriteConfig.allowOnly.join(', ') }}>
            Allowed: {list}
          </T>
          {fsWriteConfig.denyWithinAllow.length > 0 && (
            <T dimColor vars={{ list: fsWriteConfig.denyWithinAllow.join(', ') }}>
              Denied within allowed: {list}
            </T>
          )}
        </Box>
      )}

      {/* Network Restrictions */}
      {((networkConfig.allowedHosts && networkConfig.allowedHosts.length > 0) ||
        (networkConfig.deniedHosts && networkConfig.deniedHosts.length > 0)) && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color="permission">
            <T>Network Restrictions</T>
            {shouldAllowManagedSandboxDomainsOnly() ? <T> (Managed)</T> : ''}:
          </Text>
          {networkConfig.allowedHosts && networkConfig.allowedHosts.length > 0 && (
            <T dimColor vars={{ list: networkConfig.allowedHosts.join(', ') }}>
              Allowed: {list}
            </T>
          )}
          {networkConfig.deniedHosts && networkConfig.deniedHosts.length > 0 && (
            <T dimColor vars={{ list: networkConfig.deniedHosts.join(', ') }}>
              Denied: {list}
            </T>
          )}
        </Box>
      )}

      {/* Unix Sockets */}
      {allowUnixSockets && allowUnixSockets.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color="permission">
            Allowed Unix Sockets:
          </Text>
          <Text dimColor>{allowUnixSockets.join(', ')}</Text>
        </Box>
      )}

      {/* Linux Glob Pattern Warning */}
      {globPatternWarnings.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color="warning">
            ⚠ <T>Warning: Glob patterns not fully supported on Linux</T>
          </Text>
          <Text dimColor>
            The following patterns will be ignored: {globPatternWarnings.slice(0, 3).join(', ')}
            {globPatternWarnings.length > 3 && ` (${globPatternWarnings.length - 3} more)`}
          </Text>
        </Box>
      )}

      {warningsNote}
    </Box>
  );
}
