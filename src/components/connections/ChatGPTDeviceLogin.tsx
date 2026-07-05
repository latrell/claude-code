import React, { useEffect, useRef, useState } from 'react';
import { Box, Text } from '@anthropic/ink';
import {
  completeChatGPTDeviceLogin,
  requestChatGPTDeviceCode,
  type ChatGPTDeviceCode,
} from '../../services/api/openai/chatgptAuth.js';
import { t } from '../../i18n/t.js';
import { openBrowser } from '../../utils/browser.js';
import { Spinner } from '../Spinner.js';

type Props = {
  /**
   * Credential scope: tokens are written to
   * openai-chatgpt-auth.<scope>.json ('default' = the unsuffixed file).
   */
  scope: string;
  onSuccess: () => void;
  onError: (message: string) => void;
};

/**
 * ChatGPT Codex OAuth device flow bound to a connection-specific credential
 * scope, so multiple ChatGPT accounts can be stored side by side.
 */
export function ChatGPTDeviceLogin({ scope, onSuccess, onError }: Props): React.ReactNode {
  const [deviceCode, setDeviceCode] = useState<ChatGPTDeviceCode | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    const controller = new AbortController();

    async function run() {
      try {
        const code = await requestChatGPTDeviceCode();
        if (cancelled) return;
        setDeviceCode(code);
        void openBrowser(code.verificationUrl);
        await completeChatGPTDeviceLogin(code, controller.signal, scope === 'default' ? undefined : scope);
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
      <Text bold>{t('ChatGPT Account Setup')}</Text>
      {!deviceCode ? (
        <Box>
          <Spinner />
          <Text>{t('Requesting sign-in code…')}</Text>
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Text>{t('Open the URL below and enter the code to sign in:')}</Text>
          <Text color="permission">{deviceCode.verificationUrl}</Text>
          <Text>
            {t('Code:')} <Text bold>{deviceCode.userCode}</Text>
          </Text>
          <Box>
            <Spinner />
            <Text dimColor>{t('Waiting for you to finish signing in…')}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
