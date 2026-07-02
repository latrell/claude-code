import React from 'react';
import { Link, Text } from '@anthropic/ink';
import { T } from '../i18n/TText.js';

export function MCPServerDialogCopy(): React.ReactNode {
  return (
    <Text>
      <T>MCP servers may execute code or access system resources. All tool calls require approval. Learn more in the</T>
      <Link url="https://code.claude.com/docs/en/mcp">
        <T>MCP documentation</T>
      </Link>
      <T>.</T>
    </Text>
  );
}
