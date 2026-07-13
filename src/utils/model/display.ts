import { CURSOR_MODELS } from '../../services/api/cursor/models.js'
import { CHINA_LLM_PROVIDERS } from '../chinaLlmProviders.js'
import { getChatGPTCodexModelDisplayName } from './chatgptModels.js'

/** Resolve a curated, provider-neutral display alias for a runtime model id. */
export function getKnownModelDisplayName(modelId: string): string | null {
  const chatGPT = getChatGPTCodexModelDisplayName(modelId)
  if (chatGPT) return chatGPT

  for (const provider of CHINA_LLM_PROVIDERS) {
    const model = provider.models.find(candidate => candidate.id === modelId)
    if (model) return model.label
  }

  return CURSOR_MODELS.find(model => model.id === modelId)?.label ?? null
}
