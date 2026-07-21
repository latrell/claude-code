import { expect, test } from 'bun:test'
import { runIsolatedBunTest } from 'src/testUtils/runIsolatedBunTest.js'

test('plan-exit mode transition state isolated suite passes', async () => {
  const { output } = await runIsolatedBunTest({
    label: 'Plan-exit mode transition state isolated suite',
    suiteUrl: new URL('./modeTransitionState.isolated.ts', import.meta.url),
    timeoutMs: 30_000,
  })
  expect(output).toMatch(/3 pass/)
}, 35_000)
