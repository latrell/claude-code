import { describe, expect, test } from 'bun:test'
import { getDestructiveCommandWarning } from '../destructiveCommandWarning'

describe('getDestructiveCommandWarning', () => {
  // ─── Git data loss ─────────────────────────────────────────────────
  test('detects git reset --hard', () => {
    const w = getDestructiveCommandWarning('git reset --hard HEAD~1')
    expect(w).toContain('丢弃未提交的更改')
  })

  test('detects git push --force', () => {
    const w = getDestructiveCommandWarning('git push --force origin main')
    expect(w).toContain('覆盖远程历史')
  })

  test('detects git push -f', () => {
    expect(getDestructiveCommandWarning('git push -f')).toContain(
      '覆盖远程历史',
    )
  })

  test('detects git clean -f', () => {
    const w = getDestructiveCommandWarning('git clean -fd')
    expect(w).toContain('永久删除未跟踪的文件')
  })

  test('does not flag git clean --dry-run', () => {
    expect(getDestructiveCommandWarning('git clean -fdn')).toBeNull()
  })

  test('detects git checkout .', () => {
    const w = getDestructiveCommandWarning('git checkout -- .')
    expect(w).toContain('丢弃所有工作树更改')
  })

  test('detects git restore .', () => {
    const w = getDestructiveCommandWarning('git restore -- .')
    expect(w).toContain('丢弃所有工作树更改')
  })

  test('detects git stash drop', () => {
    const w = getDestructiveCommandWarning('git stash drop')
    expect(w).toContain('永久删除暂存的更改')
  })

  test('detects git branch -D', () => {
    const w = getDestructiveCommandWarning('git branch -D feature')
    expect(w).toContain('强制删除分支')
  })

  // ─── Git safety bypass ────────────────────────────────────────────
  test('detects --no-verify', () => {
    const w = getDestructiveCommandWarning("git commit --no-verify -m 'x'")
    expect(w).toContain('跳过安全钩子')
  })

  test('detects git commit --amend', () => {
    const w = getDestructiveCommandWarning('git commit --amend')
    expect(w).toContain('重写最后一次提交')
  })

  // ─── File deletion ────────────────────────────────────────────────
  test('detects rm -rf', () => {
    const w = getDestructiveCommandWarning('rm -rf /tmp/dir')
    expect(w).toContain('递归强制删除')
  })

  test('detects rm -r', () => {
    const w = getDestructiveCommandWarning('rm -r dir')
    expect(w).toContain('递归删除')
  })

  test('detects rm -f', () => {
    const w = getDestructiveCommandWarning('rm -f file.txt')
    expect(w).toContain('强制删除')
  })

  // ─── Database ─────────────────────────────────────────────────────
  test('detects DROP TABLE', () => {
    const w = getDestructiveCommandWarning("psql -c 'DROP TABLE users'")
    expect(w).toContain('删除或清空')
  })

  test('detects TRUNCATE TABLE', () => {
    const w = getDestructiveCommandWarning('TRUNCATE TABLE logs')
    expect(w).toContain('删除或清空')
  })

  test('detects DELETE FROM without WHERE', () => {
    const w = getDestructiveCommandWarning('DELETE FROM users;')
    expect(w).toContain('删除数据库表中的所有行')
  })

  // ─── Infrastructure ───────────────────────────────────────────────
  test('detects kubectl delete', () => {
    const w = getDestructiveCommandWarning('kubectl delete pod my-pod')
    expect(w).toContain('删除 Kubernetes')
  })

  test('detects terraform destroy', () => {
    const w = getDestructiveCommandWarning('terraform destroy')
    expect(w).toContain('销毁 Terraform')
  })

  // ─── Safe commands ────────────────────────────────────────────────
  test('returns null for safe commands', () => {
    expect(getDestructiveCommandWarning('ls -la')).toBeNull()
    expect(getDestructiveCommandWarning('git status')).toBeNull()
    expect(getDestructiveCommandWarning('npm install')).toBeNull()
    expect(getDestructiveCommandWarning('cat file.txt')).toBeNull()
  })
})
