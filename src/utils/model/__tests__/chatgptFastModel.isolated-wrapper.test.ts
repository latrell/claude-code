import { expect, test } from 'bun:test'
import { runIsolatedBunTest } from 'src/testUtils/runIsolatedBunTest.js'

/** Keep the real model module isolated from legacy full-suite module mocks. */
test('ChatGPT fast-model isolation suite passes', async () => {
  const { output } = await runIsolatedBunTest({
    label: 'ChatGPT fast-model isolation suite',
    suiteUrl: new URL('./chatgptFastModel.isolated.ts', import.meta.url),
    timeoutMs: 25_000,
  })
  expect(output).toMatch(/1 pass/)
}, 30_000)
