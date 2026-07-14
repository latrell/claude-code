import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The lifecycle suite installs module-level mocks for forked side requests.
 * Run it in a child process so those mocks cannot leak into unrelated suites
 * in Bun's shared test process.
 */
test('prompt suggestion lifecycle isolated suite passes', () => {
  const suitePath = fileURLToPath(
    new URL('./promptSuggestionLifecycle.isolated.ts', import.meta.url),
  )
  const suiteArg = `./${relative(process.cwd(), suitePath).replaceAll('\\', '/')}`
  const result = spawnSync(process.execPath, ['test', suiteArg], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    timeout: 25_000,
  })

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.error || result.status !== 0 || result.signal !== null) {
    throw new Error(
      `PromptSuggestion isolated suite failed (status=${String(result.status)}, signal=${String(result.signal)}, spawnError=${result.error?.message ?? 'none'}):\n${output}`,
    )
  }
  expect(output).toMatch(/5 pass/)
}, 30_000)
