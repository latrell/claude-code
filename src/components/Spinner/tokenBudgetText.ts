import figures from 'figures'
import { tf } from '../../i18n/t.js'
import { formatDuration, formatNumber } from '../../utils/format.js'

export function formatTokenBudgetText(
  tokens: number,
  budget: number,
  elapsedMs: number,
): string {
  const formattedTokens = formatNumber(tokens)
  const formattedBudget = formatNumber(budget)

  if (tokens >= budget) {
    return tf('Target: {tokens} used ({budget} min {check})', {
      tokens: formattedTokens,
      budget: formattedBudget,
      check: figures.tick,
    })
  }

  const pct = Math.round((tokens / budget) * 100)
  const remaining = budget - tokens
  const rate = elapsedMs > 5000 && tokens >= 2000 ? tokens / elapsedMs : 0
  const eta =
    rate > 0
      ? tf(' · ~{duration}', {
          duration: formatDuration(remaining / rate, {
            mostSignificantOnly: true,
          }),
        })
      : ''

  return tf('Target: {tokens} / {budget} ({percent}%){eta}', {
    tokens: formattedTokens,
    budget: formattedBudget,
    percent: pct,
    eta,
  })
}
