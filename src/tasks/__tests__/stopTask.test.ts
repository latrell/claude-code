import { expect, test } from 'bun:test'
import { runIsolatedBunTest } from 'src/testUtils/runIsolatedBunTest.js'

test('stopTask isolated suite passes', async () => {
  const { output } = await runIsolatedBunTest({
    label: 'stopTask isolated suite',
    suiteUrl: new URL('./stopTask.isolated.ts', import.meta.url),
    timeoutMs: 30_000,
  })
  expect(output).toMatch(/2 pass/)
}, 35_000)
