import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

/**
 * A terminal Chat Completions response without text or a tool call is complete
 * at the transport layer, but it is not a usable assistant turn.
 */
export class EmptyOpenAICompletionError extends TypeError {
  readonly code = 'empty_completion'
  readonly retryable = true

  constructor() {
    super('OpenAI-compatible API completed without text or a tool call')
    this.name = 'EmptyOpenAICompletionError'
  }
}

class IncompleteObservableOpenAIStreamError extends TypeError {
  readonly code = 'incomplete_stream'
  readonly retryable = true

  constructor() {
    super(
      'OpenAI-compatible API stream ended before receiving a message_stop terminal event; the response may be incomplete, please retry',
    )
    this.name = 'IncompleteObservableOpenAIStreamError'
  }
}

/**
 * Keep reasoning-only prefixes inside the eager retry boundary.
 *
 * The OpenAI compatibility adapter emits `message_start` as soon as reasoning
 * begins. Publishing that event makes a later retry unsafe because the failed
 * attempt has already reached the UI and conversation stream. Buffer only that
 * prefix until the model produces non-blank text or starts a tool call, then
 * replay it in order and continue streaming normally.
 *
 * A max-token response is intentionally released even when it contains only
 * reasoning so the query loop can use its existing output-limit recovery.
 */
export async function* holdUntilObservableOpenAIOutput(
  source: AsyncIterable<BetaRawMessageStreamEvent>,
): AsyncGenerator<BetaRawMessageStreamEvent, void> {
  const pending: BetaRawMessageStreamEvent[] = []
  let released = false
  let stopReason: string | null = null

  for await (const event of source) {
    if (released) {
      yield event
      continue
    }

    pending.push(event)

    const hasObservableOutput =
      (event.type === 'content_block_start' &&
        event.content_block.type === 'tool_use') ||
      (event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta' &&
        event.delta.text.trim().length > 0)

    if (hasObservableOutput) {
      released = true
      yield* pending.splice(0)
      continue
    }

    if (event.type === 'message_delta' && event.delta.stop_reason !== null) {
      stopReason = event.delta.stop_reason
    }

    if (event.type === 'message_stop') {
      if (stopReason === 'max_tokens') {
        yield* pending.splice(0)
        return
      }
      throw new EmptyOpenAICompletionError()
    }
  }

  if (!released) {
    throw new IncompleteObservableOpenAIStreamError()
  }
}
