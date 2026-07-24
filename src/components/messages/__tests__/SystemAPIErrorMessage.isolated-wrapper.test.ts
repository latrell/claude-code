import { expect, test } from 'bun:test'
import { runIsolatedBunTest } from 'src/testUtils/runIsolatedBunTest.js'

test('SystemAPIErrorMessage localized retry suite passes in isolation', async () => {
  const { output } = await runIsolatedBunTest({
    label: 'SystemAPIErrorMessage localized retry suite',
    suiteUrl: new URL('./SystemAPIErrorMessage.isolated.tsx', import.meta.url),
    timeoutMs: 15_000,
  })
  expect(output).toMatch(/[1-9]\d* pass/)
}, 20_000)
