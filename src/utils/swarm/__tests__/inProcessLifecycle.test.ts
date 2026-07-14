import { describe, expect, test } from 'bun:test'
import {
  createInProcessWorkAbortController,
  registerInProcessTeammateRunner,
  reserveInProcessTeammateRunner,
  waitForInProcessTeammateRunner,
} from '../inProcessLifecycle'

describe('in-process teammate lifecycle', () => {
  test('lifecycle abort propagates to the active work controller', () => {
    const lifecycle = new AbortController()
    const work = createInProcessWorkAbortController(lifecycle)
    const reason = new Error('stop teammate')

    lifecycle.abort(reason)

    expect(work.signal.aborted).toBe(true)
    expect(work.signal.reason).toBe(reason)
  })

  test('waits for the complete runner settlement', async () => {
    let settleRunner: (() => void) | undefined
    const runner = new Promise<void>(resolve => {
      settleRunner = resolve
    })
    registerInProcessTeammateRunner('teammate', runner)

    let waitFinished = false
    const waiting = waitForInProcessTeammateRunner('teammate').then(found => {
      waitFinished = true
      return found
    })

    await Promise.resolve()
    expect(waitFinished).toBe(false)

    settleRunner?.()
    expect(await waiting).toBe(true)
    expect(waitFinished).toBe(true)
  })

  test('waits across a reserved task-to-runner handoff', async () => {
    reserveInProcessTeammateRunner('late-runner')

    let waitFinished = false
    const waiting = waitForInProcessTeammateRunner('late-runner').then(
      found => {
        waitFinished = true
        return found
      },
    )
    await Promise.resolve()
    expect(waitFinished).toBe(false)

    let settleRunner: (() => void) | undefined
    const runner = new Promise<void>(resolve => {
      settleRunner = resolve
    })
    registerInProcessTeammateRunner('late-runner', runner)
    await Promise.resolve()
    expect(waitFinished).toBe(false)

    settleRunner?.()
    expect(await waiting).toBe(true)
  })

  test('fails closed instead of waiting forever when a runner never attaches', async () => {
    reserveInProcessTeammateRunner('missing-runner')

    expect(await waitForInProcessTeammateRunner('missing-runner', 1)).toBe(
      false,
    )
  })
})
