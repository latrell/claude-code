import { expect, test } from 'bun:test'
import { runIsolatedBunTest } from 'src/testUtils/runIsolatedBunTest.js'

test('remote stop deadline isolated suite passes', async () => {
  const { output } = await runIsolatedBunTest({
    label: 'Remote stop deadline isolated suite',
    suiteUrl: new URL('./teleportStopDeadline.isolated.ts', import.meta.url),
    timeoutMs: 30_000,
  })
  expect(output).toMatch(/7 pass/)
}, 35_000)
