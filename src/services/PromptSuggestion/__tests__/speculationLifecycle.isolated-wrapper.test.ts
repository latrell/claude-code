import { expect, test } from 'bun:test'
import { runIsolatedBunTest } from 'src/testUtils/runIsolatedBunTest.js'

test('speculation lifecycle isolated suite passes', async () => {
  const { output } = await runIsolatedBunTest({
    label: 'Speculation isolated suite',
    suiteUrl: new URL('./speculationLifecycle.isolated.ts', import.meta.url),
    env: { ...process.env, USER_TYPE: 'ant' },
    timeoutMs: 25_000,
  })
  expect(output).toMatch(/4 pass/)
}, 30_000)
