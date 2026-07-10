#!/usr/bin/env node
// Packs the project into release/claude-code-best.tgz (fixed name, overwrites).
// Run after build: `bun run pack:release` does build:vite + this script.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(
  /^\/([a-zA-Z]:)/,
  '$1',
)
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const releaseDir = join(root, 'release')
mkdirSync(releaseDir, { recursive: true })

const result = spawnSync(`npm pack --pack-destination "${releaseDir}"`, {
  cwd: root,
  stdio: 'inherit',
  shell: true,
})
if (result.status !== 0) process.exit(result.status ?? 1)

const packed = join(releaseDir, `${pkg.name}-${pkg.version}.tgz`)
const target = join(releaseDir, 'claude-code-best.tgz')
renameSync(packed, target)
console.log(`\nPacked → release/claude-code-best.tgz (v${pkg.version})`)
