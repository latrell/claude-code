import { expect, test } from 'bun:test'
import { spawnSync } from 'child_process'
import { relative } from 'path'
import { fileURLToPath } from 'url'

/**
 * queryModelOpenAI.isolated.ts intentionally stays outside Bun's automatic
 * test-file pattern because its module-level mock.module registrations would
 * leak into unrelated suites in the shared test process. Run it in a child Bun
 * process so the normal `bun test`/CI command still covers the suite without
 * giving those mocks a chance to pollute sibling files.
 */
test('queryModelOpenAI isolated suite passes in a separate process', () => {
  const suitePath = fileURLToPath(
    new URL('./queryModelOpenAI.isolated.ts', import.meta.url),
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
      `queryModelOpenAI isolated suite failed (status=${String(result.status)}, signal=${String(result.signal)}, spawnError=${result.error?.message ?? 'none'}):\n${output}`,
    )
  }
  expect(output).toMatch(/[1-9]\d* pass/)
}, 30_000)
