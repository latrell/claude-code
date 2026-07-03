import { describe, expect, test } from 'bun:test'
import { getDestructiveCommandWarning } from '../destructiveCommandWarning'

describe('getDestructiveCommandWarning', () => {
  describe('recursive force remove', () => {
    test('Remove-Item -Recurse -Force', () => {
      expect(
        getDestructiveCommandWarning('Remove-Item ./x -Recurse -Force'),
      ).toBe('注意：可能递归强制删除文件')
    })

    test('rm -Recurse -Force alias', () => {
      expect(getDestructiveCommandWarning('rm ./x -Recurse -Force')).toBe(
        '注意：可能递归强制删除文件',
      )
    })

    test('ri -Recurse -Force alias', () => {
      expect(getDestructiveCommandWarning('ri ./x -Recurse -Force')).toBe(
        '注意：可能递归强制删除文件',
      )
    })

    test('Remove-Item -Force -Recurse (reversed order)', () => {
      expect(
        getDestructiveCommandWarning('Remove-Item ./x -Force -Recurse'),
      ).toBe('注意：可能递归强制删除文件')
    })

    test('Remove-Item -Recurse only', () => {
      expect(getDestructiveCommandWarning('Remove-Item ./x -Recurse')).toBe(
        '注意：可能递归删除文件',
      )
    })

    test('Remove-Item -Force only', () => {
      expect(getDestructiveCommandWarning('Remove-Item ./x -Force')).toBe(
        '注意：可能强制删除文件',
      )
    })
  })

  describe('safe remove commands', () => {
    test('Remove-Item without -Recurse or -Force is safe', () => {
      expect(getDestructiveCommandWarning('Remove-Item ./x')).toBeNull()
    })

    test('del without flags is safe', () => {
      expect(getDestructiveCommandWarning('del ./x')).toBeNull()
    })
  })

  describe('disk operations', () => {
    test('Format-Volume is destructive', () => {
      expect(getDestructiveCommandWarning('Format-Volume -DriveLetter C')).toBe(
        '注意：可能格式化磁盘卷',
      )
    })

    test('Clear-Disk is destructive', () => {
      expect(getDestructiveCommandWarning('Clear-Disk -Number 0')).toBe(
        '注意：可能清除磁盘',
      )
    })
  })

  describe('git destructive operations', () => {
    test('git reset --hard', () => {
      expect(getDestructiveCommandWarning('git reset --hard HEAD~1')).toBe(
        '注意：可能丢弃未提交的更改',
      )
    })

    test('git push --force', () => {
      expect(getDestructiveCommandWarning('git push --force origin main')).toBe(
        '注意：可能覆盖远程历史',
      )
    })

    test('git push -f', () => {
      expect(getDestructiveCommandWarning('git push -f')).toBe(
        '注意：可能覆盖远程历史',
      )
    })

    test('git push --force-with-lease', () => {
      expect(getDestructiveCommandWarning('git push --force-with-lease')).toBe(
        '注意：可能覆盖远程历史',
      )
    })

    test('git clean -fd', () => {
      expect(getDestructiveCommandWarning('git clean -fd')).toBe(
        '注意：可能永久删除未跟踪的文件',
      )
    })

    test('git clean -fdx', () => {
      expect(getDestructiveCommandWarning('git clean -fdx')).toBe(
        '注意：可能永久删除未跟踪的文件',
      )
    })

    test('git stash drop', () => {
      expect(getDestructiveCommandWarning('git stash drop')).toBe(
        '注意：可能永久删除暂存的更改',
      )
    })

    test('git stash clear', () => {
      expect(getDestructiveCommandWarning('git stash clear')).toBe(
        '注意：可能永久删除暂存的更改',
      )
    })

    test('git push (normal) is safe', () => {
      expect(getDestructiveCommandWarning('git push origin main')).toBeNull()
    })

    test('git clean -n (dry-run) is safe', () => {
      expect(getDestructiveCommandWarning('git clean -n')).toBeNull()
    })

    test('git clean --dry-run is safe', () => {
      expect(getDestructiveCommandWarning('git clean --dry-run')).toBeNull()
    })
  })

  describe('database operations', () => {
    test('DROP TABLE', () => {
      expect(getDestructiveCommandWarning('DROP TABLE users')).toBe(
        '注意：可能删除或清空数据库对象',
      )
    })

    test('TRUNCATE TABLE', () => {
      expect(getDestructiveCommandWarning('TRUNCATE TABLE users')).toBe(
        '注意：可能删除或清空数据库对象',
      )
    })

    test('DROP DATABASE', () => {
      expect(getDestructiveCommandWarning('DROP DATABASE production')).toBe(
        '注意：可能删除或清空数据库对象',
      )
    })
  })

  describe('system operations', () => {
    test('Stop-Computer', () => {
      expect(getDestructiveCommandWarning('Stop-Computer')).toBe(
        '注意：将关闭计算机',
      )
    })

    test('Restart-Computer', () => {
      expect(getDestructiveCommandWarning('Restart-Computer')).toBe(
        '注意：将重启计算机',
      )
    })

    test('Clear-RecycleBin', () => {
      expect(getDestructiveCommandWarning('Clear-RecycleBin')).toBe(
        '注意：永久删除回收站文件',
      )
    })
  })

  describe('safe commands', () => {
    test('Get-Process is safe', () => {
      expect(getDestructiveCommandWarning('Get-Process')).toBeNull()
    })

    test('Get-ChildItem is safe', () => {
      expect(getDestructiveCommandWarning('Get-ChildItem')).toBeNull()
    })

    test('Write-Host is safe', () => {
      expect(getDestructiveCommandWarning("Write-Host 'hello'")).toBeNull()
    })

    test('empty string is safe', () => {
      expect(getDestructiveCommandWarning('')).toBeNull()
    })
  })

  describe('piped commands', () => {
    test('Remove-Item in pipeline', () => {
      expect(
        getDestructiveCommandWarning(
          'Get-ChildItem | Remove-Item -Recurse -Force',
        ),
      ).toBe('注意：可能递归强制删除文件')
    })
  })

  describe('case insensitive', () => {
    test('REMOVE-ITEM -RECURSE -FORCE', () => {
      expect(
        getDestructiveCommandWarning('REMOVE-ITEM ./x -RECURSE -FORCE'),
      ).toBe('注意：可能递归强制删除文件')
    })

    test('format-volume mixed case', () => {
      expect(getDestructiveCommandWarning('Format-volume')).toBe(
        '注意：可能格式化磁盘卷',
      )
    })
  })
})
