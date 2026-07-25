const DEEPSEEK_V4_SEMANTIC_EMPTY_MESSAGE = 'deepseek v4 semantic-empty response'
const DEEPSEEK_V4_MALFORMED_OUTPUT_MESSAGE =
  'deepseek v4 malformed structural output; retry request'

export const DEEPSEEK_V4_SEMANTIC_EMPTY_CODE = 'deepseek_v4_semantic_empty'
export const DEEPSEEK_V4_MALFORMED_OUTPUT_CODE = 'deepseek_v4_malformed_output'

function getErrorRecord(error: unknown): Record<string, unknown> | undefined {
  return error && typeof error === 'object'
    ? (error as Record<string, unknown>)
    : undefined
}

export function getCompatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Detect the explicit retry signal emitted by the DeepSeek V4 vLLM parser.
 * The OpenAI SDK can surface it from an HTTP 200 SSE stream without an HTTP
 * status, so the provider message remains the protocol-level fallback.
 */
export function isDeepSeekV4SemanticEmptyError(error: unknown): boolean {
  const seen = new Set<object>()
  let current: unknown = error

  for (let depth = 0; depth < 8; depth++) {
    const record = getErrorRecord(current)
    const code = record?.code
    if (code === DEEPSEEK_V4_SEMANTIC_EMPTY_CODE) return true

    const message =
      current instanceof Error
        ? current.message
        : typeof record?.message === 'string'
          ? record.message
          : typeof current === 'string'
            ? current
            : ''
    if (message.toLowerCase().includes(DEEPSEEK_V4_SEMANTIC_EMPTY_MESSAGE)) {
      return true
    }

    if (!record || seen.has(record)) break
    seen.add(record)
    current = record.cause
  }

  return false
}

/** Detect the server/client retry signal for leaked DeepSeek V4 structure. */
export function isDeepSeekV4MalformedOutputError(error: unknown): boolean {
  const seen = new Set<object>()
  let current: unknown = error

  for (let depth = 0; depth < 8; depth++) {
    const record = getErrorRecord(current)
    if (record?.code === DEEPSEEK_V4_MALFORMED_OUTPUT_CODE) return true

    const message =
      current instanceof Error
        ? current.message
        : typeof record?.message === 'string'
          ? record.message
          : typeof current === 'string'
            ? current
            : ''
    if (message.toLowerCase().includes(DEEPSEEK_V4_MALFORMED_OUTPUT_MESSAGE)) {
      return true
    }

    if (!record || seen.has(record)) break
    seen.add(record)
    current = record.cause
  }

  return false
}

/** Stable client-side shape for a provider's transient semantic-empty error. */
export class DeepSeekV4SemanticEmptyResponseError extends Error {
  readonly code = DEEPSEEK_V4_SEMANTIC_EMPTY_CODE
  readonly retryable = true
  readonly status: number
  readonly type: string
  readonly providerCode: unknown
  readonly param: unknown
  readonly headers: unknown
  readonly requestID: unknown
  readonly error: unknown

  constructor(error: unknown) {
    super(getCompatErrorMessage(error))
    const record = getErrorRecord(error)
    const numericCode =
      typeof record?.code === 'number' &&
      Number.isInteger(record.code) &&
      record.code >= 100 &&
      record.code <= 599
        ? record.code
        : undefined

    this.name = 'DeepSeekV4SemanticEmptyResponseError'
    // This is a provider-side generation failure. Infer 500 when an HTTP 200
    // SSE envelope omitted status so SDK/headless consumers still receive the
    // same server_error semantics as a normal HTTP response.
    this.status =
      typeof record?.status === 'number' ? record.status : (numericCode ?? 500)
    this.type =
      typeof record?.type === 'string' ? record.type : 'InternalServerError'
    this.providerCode = record?.code
    this.param = record?.param
    this.headers = record?.headers
    this.requestID = record?.requestID
    this.error = record?.error ?? {
      type: this.type,
      code: this.providerCode ?? this.status,
      message: this.message,
    }

    // Preserve the original SDK object, stack, response body, headers, and
    // nested cause for diagnostics without serializing the entire object into
    // transcript/API retry events.
    Object.defineProperty(this, 'cause', {
      configurable: true,
      enumerable: false,
      value: error,
    })
    if (error instanceof Error && error.stack) this.stack = error.stack
  }
}

/** Stable client-side shape for malformed DeepSeek V4 structural output. */
export class DeepSeekV4MalformedOutputError extends Error {
  readonly code = DEEPSEEK_V4_MALFORMED_OUTPUT_CODE
  readonly retryable = true
  readonly status: number
  readonly type: string
  readonly providerCode: unknown
  readonly param: unknown
  readonly headers: unknown
  readonly requestID: unknown
  readonly error: unknown

  constructor(upstreamError?: unknown) {
    const message =
      upstreamError === undefined
        ? 'DeepSeek V4 malformed structural output; retry request'
        : getCompatErrorMessage(upstreamError)
    super(message)
    const record = getErrorRecord(upstreamError)
    const numericCode =
      typeof record?.code === 'number' &&
      Number.isInteger(record.code) &&
      record.code >= 100 &&
      record.code <= 599
        ? record.code
        : undefined

    this.name = 'DeepSeekV4MalformedOutputError'
    this.status =
      typeof record?.status === 'number' ? record.status : (numericCode ?? 500)
    this.type =
      typeof record?.type === 'string' ? record.type : 'InternalServerError'
    this.providerCode = record?.code
    this.param = record?.param
    this.headers = record?.headers
    this.requestID = record?.requestID
    this.error = record?.error ?? {
      type: this.type,
      code: this.providerCode ?? this.status,
      message: this.message,
    }

    if (upstreamError !== undefined) {
      Object.defineProperty(this, 'cause', {
        configurable: true,
        enumerable: false,
        value: upstreamError,
      })
      if (upstreamError instanceof Error && upstreamError.stack) {
        this.stack = upstreamError.stack
      }
    }
  }
}

export function normalizeCompatProviderError(error: unknown): unknown {
  if (
    error instanceof DeepSeekV4SemanticEmptyResponseError ||
    error instanceof DeepSeekV4MalformedOutputError
  ) {
    return error
  }

  // Structured non-retryable decisions and actual client-error statuses remain
  // authoritative. The semantic fallback is for status-less SSE errors.
  const record = getErrorRecord(error)
  const name = error instanceof Error ? error.name : record?.name
  const constructorName = (record?.constructor as { name?: string } | undefined)
    ?.name
  if (
    name === 'AbortError' ||
    name === 'APIUserAbortError' ||
    constructorName === 'APIUserAbortError'
  ) {
    return error
  }
  if (record?.retryable === false) return error
  const statusLikeValue =
    typeof record?.status === 'number'
      ? record.status
      : typeof record?.code === 'number'
        ? record.code
        : undefined
  if (
    statusLikeValue !== undefined &&
    statusLikeValue >= 400 &&
    statusLikeValue < 500 &&
    statusLikeValue !== 408 &&
    statusLikeValue !== 409 &&
    statusLikeValue !== 429
  ) {
    return error
  }
  if (isDeepSeekV4MalformedOutputError(error)) {
    return new DeepSeekV4MalformedOutputError(error)
  }
  return isDeepSeekV4SemanticEmptyError(error)
    ? new DeepSeekV4SemanticEmptyResponseError(error)
    : error
}
