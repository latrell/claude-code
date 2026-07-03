/**
 * Detects potentially destructive PowerShell commands and returns a warning
 * string for display in the permission dialog. This is purely informational
 * -- it doesn't affect permission logic or auto-approval.
 */

type DestructivePattern = {
  pattern: RegExp
  warning: string
}

const DESTRUCTIVE_PATTERNS: DestructivePattern[] = [
  // Remove-Item with -Recurse and/or -Force (and common aliases)
  // Anchored to statement start (^, |, ;, &, newline, {, () so `git rm --force`
  // doesn't match — \b would match `rm` after any word boundary. The `{(`
  // chars catch scriptblock/group bodies: `{ rm -Force ./x }`. The stopper
  // adds only `}` (NOT `)`) — `}` ends a block so flags after it belong to a
  // different statement (`if {rm} else {... -Force}`), but `)` closes a path
  // grouping and flags after it are still this command's flags:
  // `Remove-Item (Join-Path $r "tmp") -Recurse -Force` must still warn.
  {
    pattern:
      /(?:^|[|;&\n({])\s*(Remove-Item|rm|del|rd|rmdir|ri)\b[^|;&\n}]*-Recurse\b[^|;&\n}]*-Force\b/i,
    warning: '注意：可能递归强制删除文件',
  },
  {
    pattern:
      /(?:^|[|;&\n({])\s*(Remove-Item|rm|del|rd|rmdir|ri)\b[^|;&\n}]*-Force\b[^|;&\n}]*-Recurse\b/i,
    warning: '注意：可能递归强制删除文件',
  },
  {
    pattern:
      /(?:^|[|;&\n({])\s*(Remove-Item|rm|del|rd|rmdir|ri)\b[^|;&\n}]*-Recurse\b/i,
    warning: '注意：可能递归删除文件',
  },
  {
    pattern:
      /(?:^|[|;&\n({])\s*(Remove-Item|rm|del|rd|rmdir|ri)\b[^|;&\n}]*-Force\b/i,
    warning: '注意：可能强制删除文件',
  },

  // Clear-Content on broad paths
  {
    pattern: /\bClear-Content\b[^|;&\n]*\*/i,
    warning: '注意：可能清除多个文件的内容',
  },

  // Format-Volume and Clear-Disk
  {
    pattern: /\bFormat-Volume\b/i,
    warning: '注意：可能格式化磁盘卷',
  },
  {
    pattern: /\bClear-Disk\b/i,
    warning: '注意：可能清除磁盘',
  },

  // Git destructive operations (same as BashTool)
  {
    pattern: /\bgit\s+reset\s+--hard\b/i,
    warning: '注意：可能丢弃未提交的更改',
  },
  {
    pattern: /\bgit\s+push\b[^|;&\n]*\s+(--force|--force-with-lease|-f)\b/i,
    warning: '注意：可能覆盖远程历史',
  },
  {
    pattern:
      /\bgit\s+clean\b(?![^|;&\n]*(?:-[a-zA-Z]*n|--dry-run))[^|;&\n]*-[a-zA-Z]*f/i,
    warning: '注意：可能永久删除未跟踪的文件',
  },
  {
    pattern: /\bgit\s+stash\s+(drop|clear)\b/i,
    warning: '注意：可能永久删除暂存的更改',
  },

  // Database operations
  {
    pattern: /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i,
    warning: '注意：可能删除或清空数据库对象',
  },

  // System operations
  {
    pattern: /\bStop-Computer\b/i,
    warning: '注意：将关闭计算机',
  },
  {
    pattern: /\bRestart-Computer\b/i,
    warning: '注意：将重启计算机',
  },
  {
    pattern: /\bClear-RecycleBin\b/i,
    warning: '注意：永久删除回收站文件',
  },
]

/**
 * Checks if a PowerShell command matches known destructive patterns.
 * Returns a human-readable warning string, or null if no destructive pattern is detected.
 */
export function getDestructiveCommandWarning(command: string): string | null {
  for (const { pattern, warning } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(command)) {
      return warning
    }
  }
  return null
}
