import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'

test('stopTask isolated suite passes', () => {
  const suitePath = fileURLToPath(
    new URL('./stopTask.isolated.ts', import.meta.url),
  )
  const suiteArg = `./${relative(process.cwd(), suitePath).replaceAll('\\', '/')}`
  const result = spawnSync(process.execPath, ['test', suiteArg], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    timeout: 30_000,
  })

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.error || result.status !== 0 || result.signal !== null) {
    throw new Error(
      `stopTask isolated suite failed (status=${String(result.status)}, signal=${String(result.signal)}, spawnError=${result.error?.message ?? 'none'}):\n${output}`,
    )
  }
  expect(output).toMatch(/2 pass/)
}, 35_000)
