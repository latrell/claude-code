import type {
  ProviderBalance,
  ProviderUsage,
  ProviderUsageBucket,
} from './types.js'

type Listener = (snapshot: ProviderUsage) => void

let current: ProviderUsage = {
  providerId: 'unknown',
  buckets: [],
}
let publicationEpoch = 0
let nextPublicationSequence = 0
let latestPublishedSequence = 0

const listeners: Set<Listener> = new Set()

export function getProviderUsage(): ProviderUsage {
  return current
}

/**
 * A source receives an ordered token without immediately invalidating older
 * publishers. It becomes authoritative only after it successfully publishes.
 */
export interface ProviderUsagePublication {
  epoch: number
  sequence: number
}

export function beginProviderUsagePublication(): ProviderUsagePublication {
  nextPublicationSequence += 1
  return {
    epoch: publicationEpoch,
    sequence: nextPublicationSequence,
  }
}

/**
 * Publish only when this source belongs to the active connection epoch and no
 * newer source has already produced a usable snapshot. A newer source that
 * fails or carries no quota data therefore cannot silence an older live stream.
 */
export function publishProviderBuckets(
  publication: ProviderUsagePublication,
  providerId: string,
  buckets: ProviderUsageBucket[],
): boolean {
  if (
    publication.epoch !== publicationEpoch ||
    publication.sequence < latestPublishedSequence
  ) {
    return false
  }
  latestPublishedSequence = publication.sequence
  updateProviderBuckets(providerId, buckets)
  return true
}

export function invalidateProviderUsagePublications(): void {
  publicationEpoch += 1
  latestPublishedSequence = 0
}

/**
 * Replace buckets for a provider. Passing an empty array is valid — it records
 * that the latest response carried no usable quota header.
 */
export function updateProviderBuckets(
  providerId: string,
  buckets: ProviderUsageBucket[],
): void {
  current = {
    ...current,
    providerId,
    buckets,
  }
  emit()
}

export function setProviderBalance(
  providerId: string,
  balance: ProviderBalance | null,
): void {
  current = {
    ...current,
    providerId,
    ...(balance === null ? { balance: undefined } : { balance }),
  }
  emit()
}

export function subscribeProviderUsage(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetProviderUsage(): void {
  invalidateProviderUsagePublications()
  current = { providerId: 'unknown', buckets: [] }
  emit()
}

function emit(): void {
  for (const listener of listeners) {
    try {
      listener(current)
    } catch {
      // Listener errors must not break the publish loop.
    }
  }
}
