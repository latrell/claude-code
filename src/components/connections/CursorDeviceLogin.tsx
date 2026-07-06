import React, { useEffect, useRef, useState } from 'react';
import { Box, Text } from '@anthropic/ink';
import {
  completeCursorDeviceLogin,
  startCursorDeviceLogin,
  type CursorDeviceCode,
} from '../../services/api/cursor/cursorOAuth.js';
import { t } from '../../i18n/t.js';
import { openBrowser } from '../../utils/browser.js';
import { Spinner } from '../Spinner.js';

type Props = {
  /**
   * Credential scope: tokens are written to cursor-auth.<scope>.json
   * ('default' = the unsuffixed file).
   */
  scope: string;
  onSuccess: () => void;
  onError: (message: string) => void;
};

/**
 * Cursor OAuth PKCE deep-link flow bound to a connection-specific credential
 * scope, so multiple Cursor accounts can be stored side by side. Unlike the
 * ChatGPT device flow there is no user code to type — the user just confirms
 * the sign-in in the browser and the CLI polls until tokens arrive.
 */
export function CursorDeviceLogin({ scope, onSuccess, onError }: Props): React.ReactNode {
  const [deviceCode, setDeviceCode] = useState<CursorDeviceCode | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    const controller = new AbortController();

    async function run() {
      try {
        const code = startCursorDeviceLogin();
        if (cancelled) return;
        setDeviceCode(code);
        void openBrowser(code.verificationUrl);
        await completeCursorDeviceLogin(code, controller.signal, scope === 'default' ? undefined : scope);
        if (cancelled) return;
        onSuccess();
      } catch (err) {
        if (cancelled) return;
        onError(err instanceof Error ? err.message : String(err));
      }
    }

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [scope, onSuccess, onError]);

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{t('Cursor Account Setup')}</Text>
      {!deviceCode ? (
        <Box>
          <Spinner />
          <Text>{t('Preparing sign-in…')}</Text>
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Text>{t('A browser window was opened. Confirm the sign-in there.')}</Text>
          <Text dimColor>{t('If it did not open, visit this URL:')}</Text>
          <Text color="permission">{deviceCode.verificationUrl}</Text>
          <Box>
            <Spinner />
            <Text dimColor>{t('Waiting for you to finish signing in…')}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
