import { expect, test } from 'bun:test'
import { runIsolatedBunTest } from 'src/testUtils/runIsolatedBunTest.js'

test('in-process initial task claim isolated suite passes', async () => {
  const { output } = await runIsolatedBunTest({
    label: 'In-process initial task claim suite',
    suiteUrl: new URL(
      './inProcessInitialTaskClaim.isolated.ts',
      import.meta.url,
    ),
    timeoutMs: 30_000,
  })
  expect(output).toMatch(/2 pass/)
}, 35_000)
