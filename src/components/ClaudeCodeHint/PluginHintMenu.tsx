import * as React from 'react';
import { Box, Text } from '@anthropic/ink';
import { t } from '../../i18n/t.js';
import { T } from '../../i18n/TText.js';
import { Select } from '../CustomSelect/select.js';
import { PermissionDialog } from '../permissions/PermissionDialog.js';

type Props = {
  pluginName: string;
  pluginDescription?: string;
  marketplaceName: string;
  sourceCommand: string;
  onResponse: (response: 'yes' | 'no' | 'disable') => void;
};

const AUTO_DISMISS_MS = 30_000;

export function PluginHintMenu({
  pluginName,
  pluginDescription,
  marketplaceName,
  sourceCommand,
  onResponse,
}: Props): React.ReactNode {
  const onResponseRef = React.useRef(onResponse);
  onResponseRef.current = onResponse;

  React.useEffect(() => {
    const timeoutId = setTimeout(ref => ref.current('no'), AUTO_DISMISS_MS, onResponseRef);
    return () => clearTimeout(timeoutId);
  }, []);

  function onSelect(value: string): void {
    switch (value) {
      case 'yes':
        onResponse('yes');
        break;
      case 'disable':
        onResponse('disable');
        break;
      default:
        onResponse('no');
    }
  }

  const options = [
    {
      label: (
        <Text>
          {t('Yes, install')} <Text bold>{pluginName}</Text>
        </Text>
      ),
      value: 'yes',
    },
    {
      label: t('No'),
      value: 'no',
    },
    {
      label: t("No, and don't show plugin installation hints again"),
      value: 'disable',
    },
  ];

  return (
    <PermissionDialog title={t('Plugin Recommendation')}>
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text dimColor>
            <T>The </T>
            <Text bold>{sourceCommand}</Text>
            <T> command suggests installing a plugin.</T>
          </Text>
        </Box>
        <Box>
          <T dimColor>Plugin:</T>
          <Text> {pluginName}</Text>
        </Box>
        <Box>
          <T dimColor>Marketplace:</T>
          <Text> {marketplaceName}</Text>
        </Box>
        {pluginDescription && (
          <Box>
            <Text dimColor>{pluginDescription}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <T>Would you like to install it?</T>
        </Box>
        <Box>
          <Select options={options} onChange={onSelect} onCancel={() => onResponse('no')} />
        </Box>
      </Box>
    </PermissionDialog>
  );
}
