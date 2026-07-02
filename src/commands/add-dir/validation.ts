import chalk from 'chalk'
import { stat } from 'fs/promises'
import { dirname, resolve } from 'path'
import type { ToolPermissionContext } from '../../Tool.js'
import { getErrnoCode } from '../../utils/errors.js'
import { expandPath } from '../../utils/path.js'
import {
  allWorkingDirectories,
  pathInWorkingPath,
} from '../../utils/permissions/filesystem.js'
import { t, tf } from '../../i18n/t.js'

export type AddDirectoryResult =
  | {
      resultType: 'success'
      absolutePath: string
    }
  | {
      resultType: 'emptyPath'
    }
  | {
      resultType: 'pathNotFound' | 'notADirectory'
      directoryPath: string
      absolutePath: string
    }
  | {
      resultType: 'alreadyInWorkingDirectory'
      directoryPath: string
      workingDir: string
    }

export async function validateDirectoryForWorkspace(
  directoryPath: string,
  permissionContext: ToolPermissionContext,
): Promise<AddDirectoryResult> {
  if (!directoryPath) {
    return {
      resultType: 'emptyPath',
    }
  }

  // resolve() strips the trailing slash expandPath can leave on absolute
  // inputs, so /foo and /foo/ map to the same storage key (CC-33).
  const absolutePath = resolve(expandPath(directoryPath))

  // Check if path exists and is a directory (single syscall)
  try {
    const stats = await stat(absolutePath)
    if (!stats.isDirectory()) {
      return {
        resultType: 'notADirectory',
        directoryPath,
        absolutePath,
      }
    }
  } catch (e: unknown) {
    const code = getErrnoCode(e)
    // Match prior existsSync() semantics: treat any of these as "not found"
    // rather than re-throwing. EACCES/EPERM in particular must not crash
    // startup when a settings-configured additional directory is inaccessible.
    if (
      code === 'ENOENT' ||
      code === 'ENOTDIR' ||
      code === 'EACCES' ||
      code === 'EPERM'
    ) {
      return {
        resultType: 'pathNotFound',
        directoryPath,
        absolutePath,
      }
    }
    throw e
  }

  // Get current permission context
  const currentWorkingDirs = allWorkingDirectories(permissionContext)

  // Check if already within an existing working directory
  for (const workingDir of currentWorkingDirs) {
    if (pathInWorkingPath(absolutePath, workingDir)) {
      return {
        resultType: 'alreadyInWorkingDirectory',
        directoryPath,
        workingDir,
      }
    }
  }

  return {
    resultType: 'success',
    absolutePath,
  }
}

export function addDirHelpMessage(result: AddDirectoryResult): string {
  switch (result.resultType) {
    case 'emptyPath':
      return t('Please provide a directory path.')
    case 'pathNotFound':
      return tf('Path {path} was not found.', {
        path: chalk.bold(result.absolutePath),
      })
    case 'notADirectory': {
      const parentDir = dirname(result.absolutePath)
      return tf(
        '{path} is not a directory. Did you mean to add the parent directory {parent}?',
        {
          path: chalk.bold(result.directoryPath),
          parent: chalk.bold(parentDir),
        },
      )
    }
    case 'alreadyInWorkingDirectory':
      return tf(
        '{path} is already accessible within the existing working directory {dir}.',
        {
          path: chalk.bold(result.directoryPath),
          dir: chalk.bold(result.workingDir),
        },
      )
    case 'success':
      return tf('Added {path} as a working directory.', {
        path: chalk.bold(result.absolutePath),
      })
  }
}
