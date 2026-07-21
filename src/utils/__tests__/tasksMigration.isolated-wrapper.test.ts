import { expect, test } from 'bun:test'
import { runIsolatedBunTest } from 'src/testUtils/runIsolatedBunTest.js'

test('task migration and atomic persistence isolated suite passes', async () => {
  const { output } = await runIsolatedBunTest({
    label: 'Task migration and atomic persistence isolated suite',
    suiteUrl: new URL('./tasksMigration.isolated.ts', import.meta.url),
    timeoutMs: 60_000,
  })
  expect(output).toMatch(/10 pass/)
}, 65_000)
