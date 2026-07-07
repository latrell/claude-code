import React from 'react';
import { Box, Text } from '@anthropic/ink';
import { Byline } from '@anthropic/ink';
import { t } from '../../i18n/t.js';
import { T } from '../../i18n/TText.js';

type Props = {
  serverToolsCount: number;
  serverPromptsCount: number;
  serverResourcesCount: number;
};

export function CapabilitiesSection({
  serverToolsCount,
  serverPromptsCount,
  serverResourcesCount,
}: Props): React.ReactNode {
  const capabilities = [];
  if (serverToolsCount > 0) {
    capabilities.push('tools');
  }
  if (serverResourcesCount > 0) {
    capabilities.push('resources');
  }
  if (serverPromptsCount > 0) {
    capabilities.push('prompts');
  }

  return (
    <Box>
      <T bold>Capabilities: </T>
      <Text color="text">{capabilities.length > 0 ? <Byline>{capabilities}</Byline> : t('none')}</Text>
    </Box>
  );
}
