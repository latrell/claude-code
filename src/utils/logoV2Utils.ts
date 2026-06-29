import { getDirectConnectServerUrl, getSessionId } from '../bootstrap/state.js'
import { stringWidth } from '@anthropic/ink'
import type { LogOption } from '../types/logs.js'
import { getSubscriptionName, isClaudeAISubscriber } from './auth.js'
import { getCwd } from './cwd.js'
import { getDisplayPath } from './file.js'
import {
  truncate,
  truncateToWidth,
  truncateToWidthNoEllipsis,
} from './format.js'
import {
  getAgentModel,
  getAgentModelDisplay,
  getDefaultSubagentModel,
} from './model/agent.js'
import { getAPIProvider } from './model/providers.js'
import {
  getSubagentProviderRuntimeConfig,
  type ProviderRuntimeConfig,
} from './model/subagentProvider.js'
import { getStoredChangelogFromMemory, parseChangelog } from './releaseNotes.js'
import { gt } from './semver.js'
import { loadMessageLogs } from './sessionStorage.js'
import { getInitialSettings } from './settings/settings.js'
import type { SettingsJson } from './settings/types.js'

// Layout constants
const MAX_LEFT_WIDTH = 50
const MAX_USERNAME_LENGTH = 20
const BORDER_PADDING = 4
const DIVIDER_WIDTH = 1
const CONTENT_PADDING = 2

export type LayoutMode = 'horizontal' | 'compact'

export type LayoutDimensions = {
  leftWidth: number
  rightWidth: number
  totalWidth: number
}

/**
 * Determines the layout mode based on terminal width
 */
export function getLayoutMode(columns: number): LayoutMode {
  if (columns >= 70) return 'horizontal'
  return 'compact'
}

/**
 * Calculates layout dimensions for the LogoV2 component
 */
export function calculateLayoutDimensions(
  columns: number,
  layoutMode: LayoutMode,
  optimalLeftWidth: number,
): LayoutDimensions {
  if (layoutMode === 'horizontal') {
    const leftWidth = optimalLeftWidth
    const usedSpace =
      BORDER_PADDING + CONTENT_PADDING + DIVIDER_WIDTH + leftWidth
    const availableForRight = columns - usedSpace

    let rightWidth = Math.max(30, availableForRight)
    const totalWidth = Math.min(
      leftWidth + rightWidth + DIVIDER_WIDTH + CONTENT_PADDING,
      columns - BORDER_PADDING,
    )

    // Recalculate right width if we had to cap the total
    if (totalWidth < leftWidth + rightWidth + DIVIDER_WIDTH + CONTENT_PADDING) {
      rightWidth = totalWidth - leftWidth - DIVIDER_WIDTH - CONTENT_PADDING
    }

    return { leftWidth, rightWidth, totalWidth }
  }

  // Vertical mode
  const totalWidth = Math.min(columns - BORDER_PADDING, MAX_LEFT_WIDTH + 20)
  return {
    leftWidth: totalWidth,
    rightWidth: totalWidth,
    totalWidth,
  }
}

/**
 * Detects whether an OpenAI-compatible BASE_URL points to DeepSeek.
 */
function isDeepSeekBaseUrl(baseUrl: string | undefined): boolean {
  if (!baseUrl) return false
  try {
    const hostname = new URL(baseUrl).hostname
    return hostname.includes('deepseek')
  } catch {
    return false
  }
}

/**
 * Maps a provider runtime config to a human-readable provider name.
 * Priority: modelType (e.g. 'openai') > provider (e.g. 'firstParty').
 */
function formatProviderName(runtimeConfig: ProviderRuntimeConfig): string {
  if (runtimeConfig.modelType) {
    switch (runtimeConfig.modelType) {
      case 'anthropic':
        return 'Anthropic'
      case 'openai':
        return isDeepSeekBaseUrl(runtimeConfig.env?.OPENAI_BASE_URL)
          ? 'DeepSeek'
          : 'OpenAI'
      case 'gemini':
        return 'Gemini'
      case 'grok':
        return 'Grok'
      default:
        return runtimeConfig.modelType
    }
  }
  switch (runtimeConfig.provider) {
    case 'firstParty':
      return 'Anthropic'
    case 'openai':
      return isDeepSeekBaseUrl(runtimeConfig.env?.OPENAI_BASE_URL)
        ? 'DeepSeek'
        : 'OpenAI'
    case 'gemini':
      return 'Gemini'
    case 'grok':
      return 'Grok'
    case 'bedrock':
      return 'Bedrock'
    case 'vertex':
      return 'Vertex'
    case 'foundry':
      return 'Foundry'
    default:
      return runtimeConfig.provider
  }
}

/**
 * Computes the human-readable billing/entitlement name for the main model.
 *
 * @param settings - Optional settings override (for testing)
 * @param env - Optional env override (for testing)
 */
export function getBillingDisplayName(
  settings?: Pick<SettingsJson, 'modelType'>,
  env?: Record<string, string | undefined>,
): string {
  const provider = getAPIProvider(settings, env)
  switch (provider) {
    case 'firstParty': {
      if (isClaudeAISubscriber()) return getSubscriptionName()
      return 'Anthropic API'
    }
    case 'openai': {
      const authMode = env?.OPENAI_AUTH_MODE ?? process.env.OPENAI_AUTH_MODE
      const baseUrl = env?.OPENAI_BASE_URL ?? process.env.OPENAI_BASE_URL
      if (authMode === 'chatgpt') return 'ChatGPT Subscription'
      if (isDeepSeekBaseUrl(baseUrl)) return 'DeepSeek API'
      if (baseUrl) return 'OpenAI-compatible API'
      return 'OpenAI API'
    }
    case 'gemini':
      return 'Gemini API'
    case 'grok':
      return 'Grok API'
    case 'bedrock':
      return 'AWS Bedrock'
    case 'vertex':
      return 'Vertex AI'
    case 'foundry':
      return 'Foundry'
  }
}

/**
 * Computes the billing display name for a subagent based on its provider
 * runtime config and the parent model's billing type.
 *
 * For Anthropic subagents, inherits the parent billing type since both
 * share the same credentials. For other providers, computes the billing
 * name independently using the subagent's env configuration.
 *
 * @param runtimeConfig - The subagent provider runtime config
 * @param parentBillingType - The parent (main model) billing display name
 */
export function getSubagentBillingDisplayName(
  runtimeConfig: ProviderRuntimeConfig | undefined,
  parentBillingType: string,
): string | undefined {
  if (!runtimeConfig) return undefined

  const provider = runtimeConfig.provider
  const modelType = runtimeConfig.modelType
  const env = runtimeConfig.env ?? {}

  // Anthropic subagent: use parent billing if it's Claude subscription or Anthropic API
  const isAnthropicType =
    modelType === 'anthropic' ||
    (modelType === undefined && provider === 'firstParty')

  if (isAnthropicType) {
    return parentBillingType
  }

  // Non-Anthropic subagent: compute billing from runtime config
  const effectiveModelType =
    modelType ??
    (provider === 'openai'
      ? ('openai' as const)
      : provider === 'gemini'
        ? ('gemini' as const)
        : provider === 'grok'
          ? ('grok' as const)
          : undefined)

  switch (effectiveModelType) {
    case 'openai': {
      const baseUrl = env.OPENAI_BASE_URL
      const authMode = env.OPENAI_AUTH_MODE
      if (authMode === 'chatgpt') return 'ChatGPT Subscription'
      if (isDeepSeekBaseUrl(baseUrl)) return 'DeepSeek API'
      if (baseUrl) return 'OpenAI-compatible API'
      return 'OpenAI API'
    }
    case 'gemini':
      return 'Gemini API'
    case 'grok':
      return 'Grok API'
    default:
      break
  }

  switch (provider) {
    case 'bedrock':
      return 'AWS Bedrock'
    case 'vertex':
      return 'Vertex AI'
    case 'foundry':
      return 'Foundry'
    default:
      return undefined
  }
}

/**
 * Formats the subagent provider display line for the startup banner.
 * Returns undefined when no subagent provider is configured.
 *
 * Uses getAgentModel() to resolve the effective subagent model from the
 * provider runtime config. When the resolved model matches the parent model
 * (i.e. the subagent truly inherits), displays "Inherit from parent".
 * Otherwise displays the resolved model name (e.g. "deepseek-v4-pro").
 *
 * @param runtimeConfig - The subagent provider runtime config
 * @param parentModel - The resolved main loop model name
 * @param billingType - Optional billing/entitlement name to append
 */
export function formatSubagentDisplayLine(
  runtimeConfig: ProviderRuntimeConfig | undefined,
  parentModel: string,
  billingType?: string,
): string | undefined {
  if (!runtimeConfig) return undefined
  const providerName = formatProviderName(runtimeConfig)
  const resolvedModel = getAgentModel(
    getDefaultSubagentModel(),
    parentModel,
    undefined,
    'default',
    runtimeConfig,
  )
  const modelPart =
    resolvedModel === parentModel
      ? 'Inherit from parent'
      : getAgentModelDisplay(resolvedModel)

  const billingSuffix = billingType ? ` · ${billingType}` : ''
  return `Subagent: ${providerName} · ${modelPart}${billingSuffix}`
}

/**
 * Calculates optimal left panel width based on content
 */
export function calculateOptimalLeftWidth(
  welcomeMessage: string,
  truncatedCwd: string,
  modelLine: string,
  subagentLine?: string,
): number {
  const widths = [
    stringWidth(welcomeMessage),
    stringWidth(truncatedCwd),
    stringWidth(modelLine),
    20, // Minimum for clawd art
  ]
  if (subagentLine) {
    widths.push(stringWidth(subagentLine))
  }
  const contentWidth = Math.max(...widths)
  return Math.min(contentWidth + 4, MAX_LEFT_WIDTH) // +4 for padding
}

/**
 * Formats the welcome message based on username
 */
export function formatWelcomeMessage(username: string | null): string {
  if (!username || username.length > MAX_USERNAME_LENGTH) {
    return 'Welcome back!'
  }
  return `Welcome back ${username}!`
}

/**
 * Truncates a path in the middle if it's too long.
 * Width-aware: uses stringWidth() for correct CJK/emoji measurement.
 */
export function truncatePath(path: string, maxLength: number): string {
  if (stringWidth(path) <= maxLength) return path

  const separator = '/'
  const ellipsis = '…'
  const ellipsisWidth = 1 // '…' is always 1 column
  const separatorWidth = 1

  const parts = path.split(separator)
  const first = parts[0] || ''
  const last = parts[parts.length - 1] || ''
  const firstWidth = stringWidth(first)
  const lastWidth = stringWidth(last)

  // Only one part, so show as much of it as we can
  if (parts.length === 1) {
    return truncateToWidth(path, maxLength)
  }

  // We don't have enough space to show the last part, so truncate it
  // But since firstPart is empty (unix) we don't want the extra ellipsis
  if (first === '' && ellipsisWidth + separatorWidth + lastWidth >= maxLength) {
    return `${separator}${truncateToWidth(last, Math.max(1, maxLength - separatorWidth))}`
  }

  // We have a first part so let's show the ellipsis and truncate last part
  if (
    first !== '' &&
    ellipsisWidth * 2 + separatorWidth + lastWidth >= maxLength
  ) {
    return `${ellipsis}${separator}${truncateToWidth(last, Math.max(1, maxLength - ellipsisWidth - separatorWidth))}`
  }

  // Truncate first and leave last
  if (parts.length === 2) {
    const availableForFirst =
      maxLength - ellipsisWidth - separatorWidth - lastWidth
    return `${truncateToWidthNoEllipsis(first, availableForFirst)}${ellipsis}${separator}${last}`
  }

  // Now we start removing middle parts

  let available =
    maxLength - firstWidth - lastWidth - ellipsisWidth - 2 * separatorWidth

  // Just the first and last are too long, so truncate first
  if (available <= 0) {
    const availableForFirst = Math.max(
      0,
      maxLength - lastWidth - ellipsisWidth - 2 * separatorWidth,
    )
    const truncatedFirst = truncateToWidthNoEllipsis(first, availableForFirst)
    return `${truncatedFirst}${separator}${ellipsis}${separator}${last}`
  }

  // Try to keep as many middle parts as possible
  const middleParts = []
  for (let i = parts.length - 2; i > 0; i--) {
    const part = parts[i]
    if (part && stringWidth(part) + separatorWidth <= available) {
      middleParts.unshift(part)
      available -= stringWidth(part) + separatorWidth
    } else {
      break
    }
  }

  if (middleParts.length === 0) {
    return `${first}${separator}${ellipsis}${separator}${last}`
  }

  return `${first}${separator}${ellipsis}${separator}${middleParts.join(separator)}${separator}${last}`
}

// Simple cache for preloaded activity
let cachedActivity: LogOption[] = []
let cachePromise: Promise<LogOption[]> | null = null

/**
 * Preloads recent conversations for display in Logo v2
 */
export async function getRecentActivity(): Promise<LogOption[]> {
  // Return existing promise if already loading
  if (cachePromise) {
    return cachePromise
  }

  const currentSessionId = getSessionId()
  cachePromise = loadMessageLogs(10)
    .then(logs => {
      cachedActivity = logs
        .filter(log => {
          if (log.isSidechain) return false
          if (log.sessionId === currentSessionId) return false
          if (log.summary?.includes('I apologize')) return false

          // Filter out sessions where both summary and firstPrompt are "No prompt" or missing
          const hasSummary = log.summary && log.summary !== 'No prompt'
          const hasFirstPrompt =
            log.firstPrompt && log.firstPrompt !== 'No prompt'
          return hasSummary || hasFirstPrompt
        })
        .slice(0, 3)
      return cachedActivity
    })
    .catch(() => {
      cachedActivity = []
      return cachedActivity
    })

  return cachePromise
}

/**
 * Gets cached activity synchronously
 */
export function getRecentActivitySync(): LogOption[] {
  return cachedActivity
}

/**
 * Formats release notes for display, with smart truncation
 */
export function formatReleaseNoteForDisplay(
  note: string,
  maxWidth: number,
): string {
  // Simply truncate at the max width, same as Recent Activity descriptions
  return truncate(note, maxWidth)
}

/**
 * Gets the common logo display data used by both LogoV2 and CondensedLogo.
 *
 * @param parentModel - The resolved main loop model name (e.g. from useMainLoopModel()),
 *   used to resolve the effective subagent model for display.
 */
export function getLogoDisplayData(parentModel: string): {
  version: string
  cwd: string
  billingType: string
  agentName: string | undefined
  subagentLine?: string
} {
  const version = process.env.DEMO_VERSION ?? MACRO.VERSION_DISPLAY
  const serverUrl = getDirectConnectServerUrl()
  const displayPath = process.env.DEMO_VERSION
    ? '/code/claude'
    : getDisplayPath(getCwd())
  const cwd = serverUrl
    ? `${displayPath} in ${serverUrl.replace(/^https?:\/\//, '')}`
    : displayPath
  const billingType = getBillingDisplayName()
  const agentName = getInitialSettings().agent
  const subagentRuntimeConfig = getSubagentProviderRuntimeConfig()
  const subagentBillingType = getSubagentBillingDisplayName(
    subagentRuntimeConfig,
    billingType,
  )
  const subagentLine = formatSubagentDisplayLine(
    subagentRuntimeConfig,
    parentModel,
    subagentBillingType,
  )

  return {
    version,
    cwd,
    billingType,
    agentName,
    subagentLine,
  }
}

/**
 * Determines how to display model and billing information based on available width
 */
export function formatModelAndBilling(
  modelName: string,
  billingType: string,
  availableWidth: number,
): {
  shouldSplit: boolean
  truncatedModel: string
  truncatedBilling: string
} {
  const separator = ' · '
  const combinedWidth =
    stringWidth(modelName) + separator.length + stringWidth(billingType)
  const shouldSplit = combinedWidth > availableWidth

  if (shouldSplit) {
    return {
      shouldSplit: true,
      truncatedModel: truncate(modelName, availableWidth),
      truncatedBilling: truncate(billingType, availableWidth),
    }
  }

  return {
    shouldSplit: false,
    truncatedModel: truncate(
      modelName,
      Math.max(
        availableWidth - stringWidth(billingType) - separator.length,
        10,
      ),
    ),
    truncatedBilling: billingType,
  }
}

/**
 * Gets recent release notes for Logo v2 display
 * For ants, uses commits bundled at build time
 * For external users, uses public changelog
 */
export function getRecentReleaseNotesSync(maxItems: number): string[] {
  // For ants, use bundled changelog
  if (process.env.USER_TYPE === 'ant') {
    const changelog = MACRO.VERSION_CHANGELOG
    if (changelog) {
      const commits = changelog.trim().split('\n').filter(Boolean)
      return commits.slice(0, maxItems)
    }
    return []
  }

  const changelog = getStoredChangelogFromMemory()
  if (!changelog) {
    return []
  }

  let parsed
  try {
    parsed = parseChangelog(changelog)
  } catch {
    return []
  }

  // Get notes from recent versions
  const allNotes: string[] = []
  const versions = Object.keys(parsed)
    .sort((a, b) => (gt(a, b) ? -1 : 1))
    .slice(0, 3) // Look at top 3 recent versions

  for (const version of versions) {
    const notes = parsed[version]
    if (notes) {
      allNotes.push(...notes)
    }
  }

  // Return raw notes without filtering or premature truncation
  return allNotes.slice(0, maxItems)
}
