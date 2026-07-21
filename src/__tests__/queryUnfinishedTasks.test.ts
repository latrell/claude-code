import { expect, test } from 'bun:test'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'

test('query unfinished TaskList completion guard isolated suite passes', async () => {
  const suitePath = fileURLToPath(
    new URL('./queryUnfinishedTasks.isolated.ts', import.meta.url),
  )
  const suiteArg = `./${relative(process.cwd(), suitePath).replaceAll('\\', '/')}`
  const child = Bun.spawn(
    [process.execPath, 'test', '--feature', 'TOKEN_BUDGET', suiteArg],
    {
      cwd: process.cwd(),
      env: process.env,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill()
  }, 60_000)

  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]).finally(() => clearTimeout(timeout))
  const output = `${stdout}${stderr}`
  if (timedOut || status !== 0) {
    throw new Error(
      `Query unfinished TaskList completion guard isolated suite failed (status=${status}, timedOut=${String(timedOut)}):\n${output}`,
    )
  }
  expect(output).toMatch(/12 pass/)
}, 65_000)
