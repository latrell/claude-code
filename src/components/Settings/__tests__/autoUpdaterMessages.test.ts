import { describe, expect, test } from 'bun:test'
import zh from '../../../i18n/translations/zh'
import { getAutoUpdaterDisabledDialogCopy } from '../autoUpdaterMessages'

describe('getAutoUpdaterDisabledDialogCopy', () => {
  test('explains the default opt-out and both ways to enable updates', () => {
    const copy = getAutoUpdaterDisabledDialogCopy({ type: 'default' })

    expect(copy).toEqual({
      message: 'Auto-updates are disabled by default.',
      hint: 'Set DISABLE_AUTOUPDATER=0 or ENABLE_AUTOUPDATER=1 to re-enable auto-updates.',
    })
    expect(copy?.message).not.toContain('development')
  })

  test('keeps environment and development reasons distinct', () => {
    expect(
      getAutoUpdaterDisabledDialogCopy({
        type: 'env',
        envVar: 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
      }),
    ).toEqual({
      message:
        'Auto-updates are controlled by an environment variable and cannot be changed here.',
      hint: 'Unset {envVar} to re-enable auto-updates.',
      envVar: 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
    })
    expect(getAutoUpdaterDisabledDialogCopy({ type: 'development' })).toEqual({
      message: 'Auto-updates are disabled in development builds.',
    })
  })

  test('only clears a truthy DISABLE_AUTOUPDATER override', () => {
    const copy = getAutoUpdaterDisabledDialogCopy({
      type: 'env',
      envVar: 'DISABLE_AUTOUPDATER',
    })

    expect(copy).toEqual({
      message:
        'Auto-updates are controlled by an environment variable and cannot be changed here.',
      hint: 'Set DISABLE_AUTOUPDATER=0 to re-enable auto-updates.',
    })
    expect(copy?.hint).not.toContain('ENABLE_AUTOUPDATER')
    expect(zh[copy!.hint!]).toBe(
      '设置 DISABLE_AUTOUPDATER=0 以重新启用自动更新。',
    )
  })

  test('lets config-controlled updates render the channel selector', () => {
    expect(getAutoUpdaterDisabledDialogCopy({ type: 'config' })).toBeNull()
  })
})

describe('default auto-update reason localization', () => {
  test('status reason mentions both enable environment variables', () => {
    const reason =
      'default, set DISABLE_AUTOUPDATER=0 or ENABLE_AUTOUPDATER=1 to enable'

    expect(reason).toContain('DISABLE_AUTOUPDATER=0')
    expect(reason).toContain('ENABLE_AUTOUPDATER=1')
    expect(zh[reason]).toContain('默认禁用')
  })

  test('dialog copy has Chinese translations', () => {
    const copy = getAutoUpdaterDisabledDialogCopy({ type: 'default' })!

    expect(zh[copy.message]).toBe('自动更新默认已禁用。')
    expect(zh[copy.hint!]).toContain('ENABLE_AUTOUPDATER=1')
  })
})
