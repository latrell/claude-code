import type { SessionHandle } from './types.js'

type TerminatingSession = Pick<SessionHandle, 'terminate'>

/** Terminate a stable snapshot of sessions and return IDs not confirmed dead. */
export async function terminateSessionHandles(
  sessions: Iterable<readonly [string, TerminatingSession]>,
  graceMs: number,
  forceWaitMs: number,
): Promise<string[]> {
  const snapshot = [...sessions]
  const results = await Promise.all(
    snapshot.map(async ([sessionId, handle]) => {
      try {
        return (await handle.terminate(graceMs, forceWaitMs)) ? null : sessionId
      } catch {
        return sessionId
      }
    }),
  )
  return results.filter((sessionId): sessionId is string => sessionId !== null)
}

/** Stop remote work immediately while the local process tree drains. */
export async function terminateTimedOutSession(
  handle: TerminatingSession,
  stopRemoteWork: () => Promise<void>,
  graceMs: number,
  forceWaitMs: number,
): Promise<{ localStopped: boolean; remoteStopped: boolean }> {
  const [localResult, remoteResult] = await Promise.allSettled([
    handle.terminate(graceMs, forceWaitMs),
    stopRemoteWork(),
  ])
  return {
    localStopped:
      localResult.status === 'fulfilled' && localResult.value === true,
    remoteStopped: remoteResult.status === 'fulfilled',
  }
}
