import { expect, test } from 'bun:test'
import { clearRemoteChatGPTCodexModelOptions } from '../chatgptModels.js'
import { getSmallFastModel } from '../model.js'

test('ChatGPT fast model ignores a stale public OpenAI model override', () => {
  try {
    clearRemoteChatGPTCodexModelOptions()
    const model = getSmallFastModel(
      { modelType: 'openai' },
      {
        OPENAI_AUTH_MODE: 'chatgpt',
        OPENAI_SMALL_FAST_MODEL: 'deepseek-stale-public-model',
      },
    )
    expect(model).not.toBe('deepseek-stale-public-model')
    expect(model).toStartWith('gpt-')
  } finally {
    clearRemoteChatGPTCodexModelOptions()
  }
})
