export type SdkRunGeneration = Readonly<{
  generation: number
  settled: Promise<void>
  abortController: AbortController
}>

export type SdkRunGenerationHandle = SdkRunGeneration & {
  settle: () => void
}

export type SdkRunCancellation = Readonly<{
  /** The generation captured when this cancellation epoch began. */
  settled: Promise<void>
  /**
   * Open the run gate after the cancellation response has been queued.
   * Idempotent for each cancellation lease.
   */
  releaseAfterAcknowledgement: () => void
}>

type CancellationGate = {
  epoch: number
  settled: Promise<void>
  released: Promise<void>
  resolveReleased: () => void
  leases: number
}

/**
 * Tracks the currently executing headless SDK run.
 *
 * Interrupts create a cancellation epoch before aborting the active run.
 * New generations wait behind that gate until the captured run settles and
 * every interrupt acknowledgement has been queued. This prevents a queued
 * prompt from starting a fresh HTTP stream while Stop is still being
 * acknowledged for the previous generation.
 */
export class SdkRunLifecycle {
  #nextGeneration = 0
  #nextCancellationEpoch = 0
  #active: SdkRunGenerationHandle | null = null
  #cancellationGate: CancellationGate | null = null

  start(): SdkRunGenerationHandle {
    if (this.#cancellationGate) {
      throw new Error(
        `Cannot start an SDK run during cancellation epoch ${this.#cancellationGate.epoch}`,
      )
    }
    if (this.#active) {
      throw new Error(
        `Cannot start SDK run generation ${this.#nextGeneration + 1} before generation ${this.#active.generation} settles`,
      )
    }

    let resolveSettled: () => void = () => {}
    const settled = new Promise<void>(resolve => {
      resolveSettled = resolve
    })
    let didSettle = false

    const handle: SdkRunGenerationHandle = {
      generation: ++this.#nextGeneration,
      settled,
      abortController: new AbortController(),
      settle: () => {
        if (didSettle) return
        didSettle = true
        resolveSettled()
        if (this.#active === handle) {
          this.#active = null
        }
      },
    }

    this.#active = handle
    return handle
  }

  capture(): SdkRunGeneration | null {
    return this.#active
  }

  /**
   * Reserve a generation only when no run or cancellation gate is active.
   * Callers should retry after waitUntilRunnable() when this returns null.
   */
  tryStart(): SdkRunGenerationHandle | null {
    if (this.#active || this.#cancellationGate) return null
    return this.start()
  }

  /**
   * Wait for the blocker observed at call time. The caller must retry its
   * reservation afterward: another waiter may have acquired the next
   * generation before this continuation resumes.
   */
  async waitUntilRunnable(): Promise<void> {
    const gate = this.#cancellationGate
    if (gate) {
      await gate.released
      return
    }
    await this.#active?.settled
  }

  /**
   * Latch cancellation to the current generation and block subsequent runs.
   * Concurrent interrupts share an epoch and each hold a lease, so the gate
   * opens only after every corresponding acknowledgement has been queued.
   */
  beginCancellation(reason: unknown): SdkRunCancellation {
    let gate = this.#cancellationGate
    if (!gate) {
      let resolveReleased: () => void = () => {}
      const released = new Promise<void>(resolve => {
        resolveReleased = resolve
      })
      const active = this.#active
      gate = {
        epoch: ++this.#nextCancellationEpoch,
        settled: active?.settled ?? Promise.resolve(),
        released,
        resolveReleased,
        leases: 0,
      }

      // Publish the gate before aborting: AbortSignal listeners run
      // synchronously and may otherwise try to start the next generation.
      this.#cancellationGate = gate
      active?.abortController.abort(reason)
    }

    gate.leases++
    let released = false
    return {
      settled: gate.settled,
      releaseAfterAcknowledgement: () => {
        if (released) return
        released = true
        gate.leases--
        if (gate.leases !== 0) return
        if (this.#cancellationGate === gate) {
          this.#cancellationGate = null
        }
        gate.resolveReleased()
      },
    }
  }
}
