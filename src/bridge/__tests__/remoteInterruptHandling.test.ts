import { feature } from 'bun:bundle'
import { afterEach, describe, expect, test } from 'bun:test'

import {
  handleRemoteInterrupt,
  waitForActiveTurnSettlement,
} from '../remoteInterruptHandling.js'
import {
  activateProactive,
  deactivateProactive,
  isProactivePaused,
} from '../../proactive/index.js'
import { QueryGuard } from '../../utils/QueryGuard.js'

function isProactiveFeatureEnabled() {
  if (feature('PROACTIVE')) return true
  return feature('KAIROS') ? true : false
}

describe('handleRemoteInterrupt', () => {
  afterEach(() => {
    deactivateProactive()
  })

  test('always aborts the active request', async () => {
    const controller = new AbortController()

    await handleRemoteInterrupt(controller)

    expect(controller.signal.aborted).toBe(true)
  })

  test('pauses proactive mode to return control to the user', async () => {
    activateProactive('test')
    expect(isProactivePaused()).toBe(false)

    await handleRemoteInterrupt(new AbortController())

    expect(isProactivePaused()).toBe(isProactiveFeatureEnabled())
  })

  test('does not confirm until turn settlement finishes', async () => {
    let settle = (): void => {}
    const settled = new Promise<void>(resolve => {
      settle = resolve
    })
    let confirmed = false

    const interrupt = handleRemoteInterrupt(
      new AbortController(),
      () => settled,
    )
    void interrupt.then(() => {
      confirmed = true
    })

    await Promise.resolve()
    expect(confirmed).toBe(false)
    settle()
    expect(await interrupt).toBe(true)
  })

  test('aborts a controller published during dispatch and waits for finalization', async () => {
    const queryGuard = new QueryGuard()
    expect(queryGuard.reserve()).toBe(true)

    let controller: AbortController | null = null
    let confirmed = false
    const settlement = waitForActiveTurnSettlement(() => controller, queryGuard)
    void settlement.then(() => {
      confirmed = true
    })

    controller = new AbortController()
    const generation = queryGuard.tryStart()

    expect(generation).not.toBeNull()
    if (generation === null) throw new Error('expected query to start')
    expect(controller.signal.aborted).toBe(true)
    await Promise.resolve()
    expect(confirmed).toBe(false)

    await queryGuard.finalize(generation, async () => {
      await Promise.resolve()
      expect(confirmed).toBe(false)
    })

    await settlement
    expect(confirmed).toBe(true)
  })
})
