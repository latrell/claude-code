import { expect, test } from 'bun:test'
import { runIsolatedBunTest } from 'src/testUtils/runIsolatedBunTest.js'

/**
 * The lifecycle suite installs module-level mocks for forked side requests.
 * Run it in a child process so those mocks cannot leak into unrelated suites
 * in Bun's shared test process.
 */
test('prompt suggestion lifecycle isolated suite passes', async () => {
  const { output } = await runIsolatedBunTest({
    label: 'PromptSuggestion isolated suite',
    suiteUrl: new URL(
      './promptSuggestionLifecycle.isolated.ts',
      import.meta.url,
    ),
    timeoutMs: 25_000,
  })
  expect(output).toMatch(/5 pass/)
}, 30_000)
