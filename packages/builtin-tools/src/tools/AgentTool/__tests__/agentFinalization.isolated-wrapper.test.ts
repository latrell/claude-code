import { expect, test } from 'bun:test'
import { runIsolatedBunTest } from 'src/testUtils/runIsolatedBunTest.js'

test('Agent finalization isolated suite passes', async () => {
  const { output } = await runIsolatedBunTest({
    label: 'Agent finalization isolated suite',
    suiteUrl: new URL('./agentFinalization.isolated.ts', import.meta.url),
    timeoutMs: 30_000,
  })
  expect(output).toMatch(/11 pass/)
}, 35_000)
