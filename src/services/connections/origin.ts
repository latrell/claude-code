import { CHINA_LLM_PROVIDERS } from '../../utils/chinaLlmProviders.js'
import type { Connection } from './types.js'

export type ConnectionOrigin = 'official' | 'local' | 'third-party'

const OFFICIAL_API_HOSTS = new Set(
  [
    'api.anthropic.com',
    'api.cerebras.ai',
    'api.deepseek.com',
    'api.groq.com',
    'api.openai.com',
    'api.x.ai',
    'api2.cursor.sh',
    'generativelanguage.googleapis.com',
    ...CHINA_LLM_PROVIDERS.flatMap(provider => [
      hostnameOf(provider.baseURL),
      hostnameOf(provider.codingPlan?.baseURL),
    ]),
  ].filter((host): host is string => host !== undefined),
)

function hostnameOf(baseUrl: string | undefined): string | undefined {
  if (!baseUrl) return undefined
  try {
    return new URL(baseUrl).hostname.toLowerCase().replace(/^\[|\]$/g, '')
  } catch {
    return undefined
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.')
  if (parts.length !== 4) return false
  const octets = parts.map(part => Number(part))
  if (
    octets.some(
      (octet, index) =>
        !Number.isInteger(octet) ||
        octet < 0 ||
        octet > 255 ||
        String(octet) !== parts[index],
    )
  ) {
    return false
  }

  const [first = -1, second = -1] = octets
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized)
  )
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === 'host.docker.internal' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.lan') ||
    (!hostname.includes('.') && !hostname.includes(':')) ||
    isPrivateIpv4(hostname) ||
    isPrivateIpv6(hostname)
  )
}

/**
 * Classify where a saved connection terminates using its actual endpoint.
 * Names, model ids and preset ids are deliberately ignored: they can be
 * edited independently and must never make a relay look first-party.
 */
export function classifyConnectionOrigin(
  connection: Pick<Connection, 'kind' | 'baseUrl'>,
): ConnectionOrigin {
  const hostname = hostnameOf(connection.baseUrl)

  // Provider defaults and OAuth account connections use their native
  // first-party endpoints when no custom base URL is configured.
  if (!connection.baseUrl) return 'official'
  if (!hostname) return 'third-party'
  if (isLocalHostname(hostname)) return 'local'
  if (OFFICIAL_API_HOSTS.has(hostname)) return 'official'
  return 'third-party'
}
