import {
  getCompatErrorMessage,
  isDeepSeekV4MalformedOutputError,
  isDeepSeekV4SemanticEmptyError,
} from '../services/api/compatErrors.js'
import { t } from './t.js'

export type APIErrorDisplayPhase = 'retrying' | 'failed' | 'retries_exhausted'

export function localizedAPIErrorDetail(
  error: unknown,
  phase: APIErrorDisplayPhase,
  fallback?: string,
): string {
  if (isDeepSeekV4MalformedOutputError(error)) {
    return phase === 'retries_exhausted'
      ? t('DeepSeek V4 repeatedly returned invalidly formatted answers.')
      : t('DeepSeek V4 returned an invalidly formatted answer.')
  }

  if (isDeepSeekV4SemanticEmptyError(error)) {
    return phase === 'retries_exhausted'
      ? t('DeepSeek V4 repeatedly returned no final answer or tool call.')
      : t('DeepSeek V4 returned no final answer or tool call.')
  }

  return fallback ?? getCompatErrorMessage(error)
}

export function localizedAPIErrorPrefix(retriesExhausted: boolean): string {
  return retriesExhausted ? t('API Error (retries exhausted)') : t('API Error')
}
