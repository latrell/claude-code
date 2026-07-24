import { expect, mock, test } from 'bun:test';
import * as realSettings from '../../../utils/settings/settings.js';
import type { SystemAPIErrorMessage as SystemAPIErrorMessageType } from '../../../types/message.js';
import { renderToString } from '../../../utils/staticRender.js';

mock.module('src/utils/settings/settings.js', () => ({
  ...realSettings,
  getInitialSettings: () => ({ language: '简体中文' }),
}));

const { SystemAPIErrorMessage } = await import('../SystemAPIErrorMessage.js');

test('renders a localized DeepSeek V4 retry without provider internals', async () => {
  const error = Object.assign(new Error('DeepSeek V4 semantic-empty response; retry request'), {
    code: 'deepseek_v4_semantic_empty',
    retryable: true,
  });
  const message = {
    type: 'system',
    subtype: 'api_error',
    uuid: 'retry-message',
    timestamp: new Date(0).toISOString(),
    message: { role: 'user', content: '' },
    retryInMs: 5_000,
    retryAttempt: 4,
    maxRetries: 4,
    error,
  } as unknown as SystemAPIErrorMessageType;

  const output = await renderToString(<SystemAPIErrorMessage message={message} verbose={false} />);

  expect(output).toContain('DeepSeek V4 未返回最终答复或工具调用。');
  expect(output).toContain('5 秒后重试');
  expect(output).not.toContain('semantic-empty');
  expect(output).not.toContain('retry request');
});
