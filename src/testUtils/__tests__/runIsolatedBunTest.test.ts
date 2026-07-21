import { expect, test } from 'bun:test'
import { runIsolatedBunTest } from '../runIsolatedBunTest.js'

test('kills and fully drains a timed-out isolated test child', async () => {
  const startedAt = Date.now()
  let thrown: unknown
  try {
    await runIsolatedBunTest({
      label: 'Hanging fixture',
      suiteUrl: new URL('./fixtures/hangingChild.isolated.ts', import.meta.url),
      timeoutMs: 200,
    })
  } catch (error) {
    thrown = error
  }

  expect(thrown).toBeInstanceOf(Error)
  const message = thrown instanceof Error ? thrown.message : String(thrown)
  expect(message).toContain('Hanging fixture failed')
  expect(message).toContain('timedOut=true')
  expect(message).toContain('stdout-before-timeout')
  expect(message).toContain('stderr-before-timeout')
  expect(message).toContain('command=')
  expect(message).toContain(`cwd=${process.cwd()}`)
  expect(Date.now() - startedAt).toBeLessThan(5_000)
}, 6_000)
