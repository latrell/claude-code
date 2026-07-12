import { tf } from '../i18n/t.js'

export type SearchReadSummaryOperation = 'search' | 'read'

const COUNT_MARKER = '\0'
const FIRST_PART_MARKER = '\0'
const SECOND_PART_MARKER = '\u0001'
const SUMMARY_JOIN_TEMPLATE = '{first}, {second}'

function getSearchReadOperationTemplate(
  operation: SearchReadSummaryOperation,
  count: number,
  isActive: boolean,
  isFirst: boolean,
): string {
  const isSingular = count === 1

  if (operation === 'search') {
    if (isActive) {
      if (isFirst) {
        return isSingular
          ? 'Searching for {count} pattern'
          : 'Searching for {count} patterns'
      }
      return isSingular
        ? 'searching for {count} pattern'
        : 'searching for {count} patterns'
    }
    if (isFirst) {
      return isSingular
        ? 'Searched for {count} pattern'
        : 'Searched for {count} patterns'
    }
    return isSingular
      ? 'searched for {count} pattern'
      : 'searched for {count} patterns'
  }

  if (isActive) {
    if (isFirst) {
      return isSingular ? 'Reading {count} file' : 'Reading {count} files'
    }
    return isSingular ? 'reading {count} file' : 'reading {count} files'
  }
  if (isFirst) {
    return isSingular ? 'Read {count} file' : 'Read {count} files'
  }
  return isSingular ? 'read {count} file' : 'read {count} files'
}

function formatSearchReadOperation(
  operation: SearchReadSummaryOperation,
  count: number,
  isActive: boolean,
  isFirst: boolean,
  renderedCount: string | number,
): string {
  return tf(
    getSearchReadOperationTemplate(operation, count, isActive, isFirst),
    { count: renderedCount },
  )
}

/** Format one complete search/read clause for compact activity summaries. */
export function getSearchReadOperationText(
  operation: SearchReadSummaryOperation,
  count: number,
  isActive: boolean,
  isFirst: boolean,
): string {
  return formatSearchReadOperation(operation, count, isActive, isFirst, count)
}

/**
 * Split a translated clause around its count so Ink callers can keep the
 * dynamic number bold without breaking the full-template translation.
 */
export function getSearchReadOperationTextParts(
  operation: SearchReadSummaryOperation,
  count: number,
  isActive: boolean,
  isFirst: boolean,
): readonly [beforeCount: string, afterCount: string] {
  const text = formatSearchReadOperation(
    operation,
    count,
    isActive,
    isFirst,
    COUNT_MARKER,
  )
  const markerIndex = text.indexOf(COUNT_MARKER)
  if (markerIndex === -1) return [text, '']

  return [
    text.slice(0, markerIndex),
    text.slice(markerIndex + COUNT_MARKER.length),
  ]
}

/** Join complete summary clauses with locale-appropriate punctuation. */
export function joinActivitySummaryParts(parts: readonly string[]): string {
  return parts.reduce(
    (summary, part) =>
      summary === ''
        ? part
        : tf(SUMMARY_JOIN_TEMPLATE, { first: summary, second: part }),
    '',
  )
}

/** Return only the localized separator for React callers that render nodes. */
export function getActivitySummarySeparator(): string {
  const joined = tf(SUMMARY_JOIN_TEMPLATE, {
    first: FIRST_PART_MARKER,
    second: SECOND_PART_MARKER,
  })
  const firstIndex = joined.indexOf(FIRST_PART_MARKER)
  const secondIndex = joined.indexOf(SECOND_PART_MARKER)
  if (firstIndex === -1 || secondIndex <= firstIndex) return ', '

  return joined.slice(firstIndex + FIRST_PART_MARKER.length, secondIndex)
}
