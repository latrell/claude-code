import { expect, test } from 'bun:test'
import { runIsolatedBunTest } from 'src/testUtils/runIsolatedBunTest.js'

test('sideQuery owner Stop propagation isolated suite passes', async () => {
  const { output } = await runIsolatedBunTest({
    label: 'sideQuery owner Stop propagation isolated suite',
    suiteUrl: new URL(
      './sideQueryOwnerStopPropagation.isolated.ts',
      import.meta.url,
    ),
    timeoutMs: 30_000,
  })
  expect(output).toMatch(/3 pass/)
}, 35_000)
