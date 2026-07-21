import { expect, test } from 'bun:test'
import { runIsolatedBunTest } from 'src/testUtils/runIsolatedBunTest.js'

/**
 * queryModelOpenAI.isolated.ts intentionally stays outside Bun's automatic
 * test-file pattern because its module-level mock.module registrations would
 * leak into unrelated suites in the shared test process. Run it in a child Bun
 * process so the normal `bun test`/CI command still covers the suite without
 * giving those mocks a chance to pollute sibling files.
 */
test('queryModelOpenAI isolated suite passes in a separate process', async () => {
  const { output } = await runIsolatedBunTest({
    label: 'queryModelOpenAI isolated suite',
    suiteUrl: new URL('./queryModelOpenAI.isolated.ts', import.meta.url),
    timeoutMs: 25_000,
  })
  expect(output).toMatch(/[1-9]\d* pass/)
}, 30_000)
