import { expect, test } from 'bun:test'
import { runIsolatedBunTest } from 'src/testUtils/runIsolatedBunTest.js'

test('auxiliary model Stop propagation isolated suite passes', async () => {
  const { output } = await runIsolatedBunTest({
    label: 'Auxiliary model Stop propagation isolated suite',
    suiteUrl: new URL(
      './auxiliaryModelStopPropagation.isolated.ts',
      import.meta.url,
    ),
    timeoutMs: 30_000,
  })
  expect(output).toMatch(/3 pass/)
}, 35_000)
