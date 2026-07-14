import { t, tf } from '../../../../src/i18n/t.js'
import * as acp from '@agentclientprotocol/sdk'
import type { WSContext } from 'hono/ws'
import { cancelPendingPermissions } from './acp-client.js'
import { send, sendJsonRpcError } from './client-send.js'
import { resolveNewSessionPermissionMode } from './permission-mode.js'
import { terminateAgentProcess } from './process-lifecycle.js'
import {
  clients,
  getAgentConfig,
  getDefaultPermissionMode,
  logAgent,
  logPrompt,
  logSession,
  logWs,
} from './runtime-state.js'
import {
  JSONRPC_INTERNAL_ERROR,
  JSONRPC_INVALID_PARAMS,
  JSONRPC_INVALID_REQUEST,
  JSONRPC_METHOD_NOT_FOUND,
  type ContentBlock,
} from './types.js'

export const CANCEL_CONFIRM_TIMEOUT_MS = 3_000
export const CANCEL_SEND_TIMEOUT_MS = 1_000

async function sendCancelWithTimeout(
  cancel: Promise<void>,
  timeoutMs: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      cancel,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Timed out sending cancellation to agent')),
          timeoutMs,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function waitForPromptToStop(
  prompt: Promise<void>,
  timeoutMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      prompt.then(
        () => true,
        () => true,
      ),
      new Promise<false>(resolve => {
        timer = setTimeout(() => resolve(false), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function handleNewSession(
  ws: WSContext,
  params: { cwd?: string; permissionMode?: string },
): Promise<void> {
  const state = clients.get(ws)
  if (!state?.connection) {
    logAgent.warn(
      {
        hasState: !!state,
        hasProcess: !!state?.process,
        processKilled: state?.process?.killed,
        exitCode: state?.process?.exitCode,
      },
      'handleNewSession: not connected to agent',
    )
    sendJsonRpcError(
      ws,
      state,
      state?.pendingJsonRpc?.id ?? null,
      JSONRPC_INVALID_REQUEST,
      t('Not connected to agent'),
    )
    return
  }

  const { cwd: AGENT_CWD } = getAgentConfig()

  try {
    const sessionCwd = params.cwd || AGENT_CWD
    let permissionMode: string | undefined
    try {
      permissionMode = resolveNewSessionPermissionMode(
        params.permissionMode,
        getDefaultPermissionMode(),
      )
    } catch (error) {
      sendJsonRpcError(
        ws,
        state,
        state.pendingJsonRpc?.id ?? null,
        JSONRPC_INVALID_PARAMS,
        (error as Error).message,
      )
      return
    }
    const result = await state.connection.newSession({
      cwd: sessionCwd,
      mcpServers: [],
      ...(permissionMode ? { _meta: { permissionMode } } : {}),
    })

    state.sessionId = result.sessionId
    state.modelState = result.models ?? null
    logSession.info(
      {
        sessionId: result.sessionId,
        cwd: sessionCwd,
        hasModels: !!result.models,
      },
      'created',
    )

    send(ws, 'session_created', {
      ...result,
      promptCapabilities: state.promptCapabilities,
      models: state.modelState,
    })
  } catch (error) {
    logSession.error({ error: (error as Error).message }, 'create failed')
    sendJsonRpcError(
      ws,
      state,
      state.pendingJsonRpc?.id ?? null,
      JSONRPC_INTERNAL_ERROR,
      tf('Failed to create session: {msg}', { msg: (error as Error).message }),
    )
  }
}

// ============================================================================
// Session History Operations
// Reference: Zed's AgentConnection trait - list_sessions, load_session, resume_session
// ============================================================================

export async function handleListSessions(
  ws: WSContext,
  params: { cwd?: string; cursor?: string },
): Promise<void> {
  const state = clients.get(ws)
  if (!state?.connection) {
    logAgent.warn(
      {
        hasState: !!state,
        hasProcess: !!state?.process,
        processKilled: state?.process?.killed,
        exitCode: state?.process?.exitCode,
      },
      'handleListSessions: not connected to agent',
    )
    sendJsonRpcError(
      ws,
      state,
      state?.pendingJsonRpc?.id ?? null,
      JSONRPC_INVALID_REQUEST,
      t('Not connected to agent'),
    )
    return
  }

  if (!state.agentCapabilities?.sessionCapabilities?.list) {
    sendJsonRpcError(
      ws,
      state,
      state.pendingJsonRpc?.id ?? null,
      JSONRPC_METHOD_NOT_FOUND,
      t('Listing sessions is not supported by this agent'),
    )
    return
  }

  try {
    const result = await state.connection.listSessions({
      cwd: params.cwd,
      cursor: params.cursor,
    })

    const MAX_SESSIONS = 20
    const sessions = result.sessions.slice(0, MAX_SESSIONS)
    logSession.info(
      {
        total: result.sessions.length,
        returned: sessions.length,
        hasMore: !!result.nextCursor,
      },
      'listed',
    )

    send(ws, 'session_list', {
      sessions: sessions.map((s: acp.SessionInfo) => ({
        _meta: s._meta,
        cwd: s.cwd,
        sessionId: s.sessionId,
        title: s.title,
        updatedAt: s.updatedAt,
      })),
      nextCursor: result.nextCursor,
      _meta: result._meta,
    })
  } catch (error) {
    logSession.error({ error: (error as Error).message }, 'list failed')
    sendJsonRpcError(
      ws,
      state,
      state.pendingJsonRpc?.id ?? null,
      JSONRPC_INTERNAL_ERROR,
      tf('Failed to list sessions: {msg}', { msg: (error as Error).message }),
    )
  }
}

export async function handleLoadSession(
  ws: WSContext,
  params: { sessionId: string; cwd?: string },
): Promise<void> {
  const state = clients.get(ws)
  if (!state?.connection) {
    logAgent.warn(
      {
        hasState: !!state,
        hasProcess: !!state?.process,
        processKilled: state?.process?.killed,
        exitCode: state?.process?.exitCode,
      },
      'handleLoadSession: not connected to agent',
    )
    sendJsonRpcError(
      ws,
      state,
      state?.pendingJsonRpc?.id ?? null,
      JSONRPC_INVALID_REQUEST,
      t('Not connected to agent'),
    )
    return
  }

  if (!state.agentCapabilities?.loadSession) {
    sendJsonRpcError(
      ws,
      state,
      state.pendingJsonRpc?.id ?? null,
      JSONRPC_METHOD_NOT_FOUND,
      t('Loading sessions is not supported by this agent'),
    )
    return
  }

  const { cwd: AGENT_CWD } = getAgentConfig()

  try {
    const sessionCwd = params.cwd || AGENT_CWD
    const sessionId = params.sessionId
    const result = await state.connection.loadSession({
      sessionId,
      cwd: sessionCwd,
      mcpServers: [],
    })

    state.sessionId = sessionId
    state.modelState = result.models ?? null
    logSession.info({ sessionId, cwd: sessionCwd }, 'loaded')

    send(ws, 'session_loaded', {
      sessionId,
      promptCapabilities: state.promptCapabilities,
      models: state.modelState,
    })
  } catch (error) {
    logSession.error({ error: (error as Error).message }, 'load failed')
    sendJsonRpcError(
      ws,
      state,
      state.pendingJsonRpc?.id ?? null,
      JSONRPC_INTERNAL_ERROR,
      tf('Failed to load session: {msg}', { msg: (error as Error).message }),
    )
  }
}

export async function handleResumeSession(
  ws: WSContext,
  params: { sessionId: string; cwd?: string },
): Promise<void> {
  const state = clients.get(ws)
  if (!state?.connection) {
    logAgent.warn(
      {
        hasState: !!state,
        hasProcess: !!state?.process,
        processKilled: state?.process?.killed,
        exitCode: state?.process?.exitCode,
      },
      'handleResumeSession: not connected to agent',
    )
    sendJsonRpcError(
      ws,
      state,
      state?.pendingJsonRpc?.id ?? null,
      JSONRPC_INVALID_REQUEST,
      t('Not connected to agent'),
    )
    return
  }

  if (!state.agentCapabilities?.sessionCapabilities?.resume) {
    sendJsonRpcError(
      ws,
      state,
      state.pendingJsonRpc?.id ?? null,
      JSONRPC_METHOD_NOT_FOUND,
      t('Resuming sessions is not supported by this agent'),
    )
    return
  }

  const { cwd: AGENT_CWD } = getAgentConfig()

  try {
    const sessionCwd = params.cwd || AGENT_CWD
    const sessionId = params.sessionId
    const result = await state.connection.unstable_resumeSession({
      sessionId,
      cwd: sessionCwd,
    })

    state.sessionId = sessionId
    state.modelState = result.models ?? null
    logSession.info({ sessionId, cwd: sessionCwd }, 'resumed')

    send(ws, 'session_resumed', {
      sessionId,
      promptCapabilities: state.promptCapabilities,
      models: state.modelState,
    })
  } catch (error) {
    logSession.error({ error: (error as Error).message }, 'resume failed')
    sendJsonRpcError(
      ws,
      state,
      state.pendingJsonRpc?.id ?? null,
      JSONRPC_INTERNAL_ERROR,
      tf('Failed to resume session: {msg}', { msg: (error as Error).message }),
    )
  }
}

// Reference: Zed's AcpThread.send() forwards Vec<acp::ContentBlock> to agent
export async function handlePrompt(
  ws: WSContext,
  params: { content: ContentBlock[] },
): Promise<void> {
  const state = clients.get(ws)
  if (!state?.connection || !state.sessionId) {
    sendJsonRpcError(
      ws,
      state,
      state?.pendingJsonRpc?.id ?? null,
      JSONRPC_INVALID_REQUEST,
      t('No active session'),
    )
    return
  }

  if (state.activePrompt) {
    sendJsonRpcError(
      ws,
      state,
      state.pendingJsonRpc?.id ?? null,
      JSONRPC_INVALID_REQUEST,
      t('A prompt is already running'),
    )
    return
  }

  let activePrompt: Promise<void> | null = null
  try {
    const firstText = params.content.find(b => b.type === 'text')?.text
    const images = params.content.filter(b => b.type === 'image')
    logPrompt.debug(
      {
        text: firstText?.slice(0, 100),
        imageCount: images.length,
        blockCount: params.content.length,
      },
      'sending',
    )

    const promptRequest = state.connection.prompt({
      sessionId: state.sessionId,
      prompt: params.content as acp.ContentBlock[],
    })
    activePrompt = promptRequest.then(
      () => undefined,
      () => undefined,
    )
    state.activePrompt = activePrompt
    const result = await promptRequest

    logPrompt.info({ stopReason: result.stopReason }, 'completed')
    send(ws, 'prompt_complete', result)
  } catch (error) {
    logPrompt.error({ error: (error as Error).message }, 'failed')
    sendJsonRpcError(
      ws,
      state,
      state.pendingJsonRpc?.id ?? null,
      JSONRPC_INTERNAL_ERROR,
      tf('Prompt failed: {msg}', { msg: (error as Error).message }),
    )
  } finally {
    if (activePrompt && state.activePrompt === activePrompt) {
      state.activePrompt = null
    }
  }
}

// Handle cancel request from client
export async function handleCancel(ws: WSContext): Promise<void> {
  const state = clients.get(ws)
  if (!state?.connection || !state.sessionId) {
    logWs.warn('cancel requested but no active session')
    return
  }

  logSession.info({ sessionId: state.sessionId }, 'cancel requested')
  cancelPendingPermissions(state)

  const activePrompt = state.activePrompt
  let cancelError: Error | null = null
  try {
    await sendCancelWithTimeout(
      state.connection.cancel({ sessionId: state.sessionId }),
      CANCEL_SEND_TIMEOUT_MS,
    )
    logSession.info({ sessionId: state.sessionId }, 'cancel sent')
  } catch (error) {
    cancelError = error as Error
    logSession.error({ error: cancelError.message }, 'cancel failed')
  }

  if (!activePrompt) {
    if (cancelError) throw cancelError
    return
  }

  if (await waitForPromptToStop(activePrompt, CANCEL_CONFIRM_TIMEOUT_MS)) {
    logSession.info({ sessionId: state.sessionId }, 'cancel confirmed')
    return
  }

  logSession.warn(
    { sessionId: state.sessionId },
    'cancel was not confirmed; terminating agent process tree',
  )
  const stopped = await terminateAgentProcess(state)
  if (!stopped) {
    throw new Error(
      cancelError
        ? `Cancel failed (${cancelError.message}) and the agent process tree could not be stopped`
        : 'Agent did not confirm cancellation and its process tree could not be stopped',
    )
  }
  logSession.info('cancel confirmed by agent process exit')
}

// Reference: Zed's AgentModelSelector.select_model() calls connection.set_session_model()
export async function handleSetSessionModel(
  ws: WSContext,
  params: { modelId: string },
): Promise<void> {
  const state = clients.get(ws)
  if (!state?.connection || !state.sessionId) {
    sendJsonRpcError(
      ws,
      state,
      state?.pendingJsonRpc?.id ?? null,
      JSONRPC_INVALID_REQUEST,
      t('No active session'),
    )
    return
  }

  if (!state.modelState) {
    sendJsonRpcError(
      ws,
      state,
      state.pendingJsonRpc?.id ?? null,
      JSONRPC_METHOD_NOT_FOUND,
      t('Model selection not supported by this agent'),
    )
    return
  }

  try {
    logSession.info(
      { sessionId: state.sessionId, modelId: params.modelId },
      'setting model',
    )
    await state.connection.unstable_setSessionModel({
      sessionId: state.sessionId,
      modelId: params.modelId,
    })
    state.modelState = { ...state.modelState, currentModelId: params.modelId }
    send(ws, 'model_changed', { modelId: params.modelId })
    logSession.info({ modelId: params.modelId }, 'model changed')
  } catch (error) {
    logSession.error({ error: (error as Error).message }, 'set model failed')
    sendJsonRpcError(
      ws,
      state,
      state.pendingJsonRpc?.id ?? null,
      JSONRPC_INTERNAL_ERROR,
      tf('Failed to set model: {msg}', { msg: (error as Error).message }),
    )
  }
}
