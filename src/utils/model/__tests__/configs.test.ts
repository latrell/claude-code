import { describe, expect, test } from 'bun:test'
import {
  CLAUDE_FABLE_5_CONFIG,
  CLAUDE_OPUS_4_7_CONFIG,
  CLAUDE_OPUS_4_8_CONFIG,
  CLAUDE_SONNET_5_CONFIG,
} from '../configs.js'

describe('current Bedrock model ids', () => {
  test('models after Opus 4.6 do not use the retired -v1 suffix', () => {
    expect(CLAUDE_OPUS_4_7_CONFIG.bedrock).toBe('us.anthropic.claude-opus-4-7')
    expect(CLAUDE_FABLE_5_CONFIG.bedrock).toBe('us.anthropic.claude-fable-5')
    expect(CLAUDE_OPUS_4_8_CONFIG.bedrock).toBe('us.anthropic.claude-opus-4-8')
    expect(CLAUDE_SONNET_5_CONFIG.bedrock).toBe('us.anthropic.claude-sonnet-5')
  })
})
