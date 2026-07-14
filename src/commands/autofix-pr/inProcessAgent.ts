import { randomUUID } from 'node:crypto'
import { getSessionId } from '../../bootstrap/state.js'
import type { SessionId } from '../../types/ids.js'
import { createChildAbortController } from '../../utils/abortController.js'

export type AutofixTeammate = {
  agentId: string
  agentName: 'autofix-pr'
  teamName: '_autofix'
  color: undefined
  planModeRequired: false
  parentSessionId: SessionId
  abortController: AbortController
  taskId: string
}

export function createAutofixTeammate(
  _initialMessage: string,
  _target: string,
  parentAbortController?: AbortController,
): AutofixTeammate {
  return {
    agentId: randomUUID(),
    agentName: 'autofix-pr',
    teamName: '_autofix',
    color: undefined,
    planModeRequired: false,
    parentSessionId: getSessionId(),
    abortController: parentAbortController
      ? createChildAbortController(parentAbortController)
      : new AbortController(),
    taskId: randomUUID(),
  }
}
