import { expect, test } from 'bun:test'
import { runIsolatedBunTest } from 'src/testUtils/runIsolatedBunTest.js'

test('query unfinished TaskList completion guard isolated suite passes', async () => {
  const { output } = await runIsolatedBunTest({
    label: 'Query unfinished TaskList completion guard isolated suite',
    suiteUrl: new URL('./queryUnfinishedTasks.isolated.ts', import.meta.url),
    timeoutMs: 60_000,
    testArgs: ['--feature', 'TOKEN_BUDGET'],
  })
  expect(output).toMatch(/30 pass/)
}, 65_000)
