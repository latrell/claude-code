#!/usr/bin/env bun
/**
 * Health check script – verifies the project can build and tests pass.
 * Run via: bun run health
 */

const { spawnSync } = await import('child_process')
const { resolve } = await import('path')

const projectRoot = resolve(import.meta.dirname, '..')

console.log('Running precheck...')
const result = spawnSync('bun', ['run', 'precheck'], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: true,
})

if (result.status === 0) {
  console.log('\n✓ Health check passed')
  process.exit(0)
} else {
  console.error('\n✗ Health check failed')
  process.exit(1)
}
