import { describe, expect, test } from 'bun:test'
import {
  beginRemoteSessionCallbackGeneration,
  invalidateRemoteSessionCallbacks,
  resetRemoteSessionLifecycle,
} from '../remoteSessionLifecycle.js'

function ref<T>(current: T): { current: T } {
  return { current }
}

describe('resetRemoteSessionLifecycle', () => {
  test('clears loading and every Stop gate when config is removed', () => {
    const loading: boolean[] = []
    const refs = {
      cancellationPending: ref(true),
      cancellationGeneration: ref(4),
      remoteCancellationUnconfirmed: ref(true),
      remoteTurnActive: ref(true),
      cancellationWarningShown: ref(true),
      isCompacting: ref(true),
      hasUpdatedTitle: ref(true),
      responseTimeout: ref<ReturnType<typeof setTimeout> | null>(null),
    }

    resetRemoteSessionLifecycle(refs, value => loading.push(value))

    expect(refs.cancellationGeneration.current).toBe(5)
    expect(refs.cancellationPending.current).toBe(false)
    expect(refs.remoteCancellationUnconfirmed.current).toBe(false)
    expect(refs.remoteTurnActive.current).toBe(false)
    expect(refs.cancellationWarningShown.current).toBe(false)
    expect(refs.isCompacting.current).toBe(false)
    expect(refs.hasUpdatedTitle.current).toBe(false)
    expect(loading).toEqual([false])
  })

  test('does not inherit loading when config A is replaced by idle config B', () => {
    const loading: boolean[] = []
    const refs = {
      cancellationPending: ref(true),
      cancellationGeneration: ref(8),
      remoteCancellationUnconfirmed: ref(true),
      remoteTurnActive: ref(true),
      cancellationWarningShown: ref(true),
      isCompacting: ref(true),
      hasUpdatedTitle: ref(true),
      responseTimeout: ref<ReturnType<typeof setTimeout> | null>(null),
    }

    resetRemoteSessionLifecycle(refs, value => loading.push(value), {
      remoteTurnActive: false,
      titleOwnerActive: false,
    })

    expect(refs.remoteTurnActive.current).toBe(false)
    expect(refs.isCompacting.current).toBe(false)
    expect(loading).toEqual([false])
  })

  test('does not pin main loading while config A title cancellation is pending', () => {
    const loading: boolean[] = []
    const refs = {
      cancellationPending: ref(true),
      cancellationGeneration: ref(2),
      remoteCancellationUnconfirmed: ref(false),
      remoteTurnActive: ref(true),
      cancellationWarningShown: ref(false),
      isCompacting: ref(false),
      hasUpdatedTitle: ref(true),
      responseTimeout: ref<ReturnType<typeof setTimeout> | null>(null),
    }

    resetRemoteSessionLifecycle(refs, value => loading.push(value), {
      remoteTurnActive: false,
      titleOwnerActive: true,
    })

    expect(refs.remoteTurnActive.current).toBe(false)
    expect(loading).toEqual([false])
  })

  test('keeps loading honest while config A manager owns an aborted POST', () => {
    const loading: boolean[] = []
    const refs = {
      cancellationPending: ref(false),
      cancellationGeneration: ref(3),
      remoteCancellationUnconfirmed: ref(false),
      remoteTurnActive: ref(true),
      cancellationWarningShown: ref(false),
      isCompacting: ref(false),
      hasUpdatedTitle: ref(false),
      responseTimeout: ref<ReturnType<typeof setTimeout> | null>(null),
    }

    resetRemoteSessionLifecycle(refs, value => loading.push(value), {
      remoteTurnActive: false,
      managerOwnerActive: true,
    })

    expect(refs.remoteTurnActive.current).toBe(false)
    expect(loading).toEqual([true])
  })
})

describe('remote manager callback generations', () => {
  test('rejects callbacks from a manager after teardown or replacement', () => {
    const generation = ref(0)
    const firstIsCurrent = beginRemoteSessionCallbackGeneration(generation)

    expect(firstIsCurrent()).toBe(true)
    invalidateRemoteSessionCallbacks(generation)
    expect(firstIsCurrent()).toBe(false)

    const secondIsCurrent = beginRemoteSessionCallbackGeneration(generation)
    expect(firstIsCurrent()).toBe(false)
    expect(secondIsCurrent()).toBe(true)
  })
})
