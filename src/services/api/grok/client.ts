import OpenAI from 'openai'
import { getProxyFetchOptions, isKeepAliveDisabled } from 'src/utils/proxy.js'

/**
 * Environment variables:
 *
 * GROK_API_KEY (or XAI_API_KEY): Required. API key for the xAI Grok endpoint.
 * GROK_BASE_URL: Optional. Defaults to https://api.x.ai/v1.
 */

const DEFAULT_BASE_URL = 'https://api.x.ai/v1'

let cachedClient: OpenAI | null = null
let cachedClientKeepAliveDisabled = false
let cachedClientMaxRetries = 0

export function getGrokClient(options?: {
  maxRetries?: number
  fetchOverride?: typeof fetch
  source?: string
  envOverride?: Record<string, string | undefined>
}): OpenAI {
  const keepAliveDisabled = isKeepAliveDisabled()
  const maxRetries = options?.maxRetries ?? 0
  if (
    !options?.fetchOverride &&
    !options?.envOverride &&
    cachedClient &&
    cachedClientKeepAliveDisabled === keepAliveDisabled &&
    cachedClientMaxRetries === maxRetries
  ) {
    return cachedClient
  }

  const env = options?.envOverride ?? process.env
  const apiKey = env.GROK_API_KEY || env.XAI_API_KEY || ''
  const baseURL = env.GROK_BASE_URL || DEFAULT_BASE_URL

  const client = new OpenAI({
    apiKey,
    baseURL,
    maxRetries,
    timeout: parseInt(env.API_TIMEOUT_MS || String(600 * 1000), 10),
    dangerouslyAllowBrowser: true,
    fetchOptions: getProxyFetchOptions({ forAnthropicAPI: false }),
    ...(options?.fetchOverride && { fetch: options.fetchOverride }),
  })

  if (!options?.fetchOverride && !options?.envOverride) {
    cachedClient = client
    cachedClientKeepAliveDisabled = keepAliveDisabled
    cachedClientMaxRetries = maxRetries
  }

  return client
}

export function clearGrokClientCache(): void {
  cachedClient = null
  cachedClientKeepAliveDisabled = isKeepAliveDisabled()
  cachedClientMaxRetries = 0
}
