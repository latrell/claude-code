import { expect, test } from 'bun:test'
import { runIsolatedBunTest } from 'src/testUtils/runIsolatedBunTest.js'

test('Agent tool utilities isolated suite passes', async () => {
  const { output } = await runIsolatedBunTest({
    label: 'Agent tool utilities isolated suite',
    suiteUrl: new URL('./agentToolUtils.isolated.ts', import.meta.url),
    timeoutMs: 30_000,
  })
  expect(output).toMatch(/31 pass/)
}, 35_000)
