import { Writable, Readable } from 'node:stream'
import { spawn } from 'node:child_process'
import * as acp from '@agentclientprotocol/sdk'
import type { WSContext } from 'hono/ws'
import { tf } from '../../../../src/i18n/t.js'
import { send, sendJsonRpcError } from './client-send.js'
import { createClient } from './acp-client.js'
import { buildAgentEnv } from './permission-mode.js'
import { disconnectAgent, terminateAgentProcess } from './process-lifecycle.js'
import { clients, getAgentConfig, logAgent } from './runtime-state.js'
import {
  JSONRPC_INTERNAL_ERROR,
  type AgentCapabilities,
  type ClientState,
} from './types.js'

export async function handleConnect(ws: WSContext): Promise<void> {
  const state = clients.get(ws)
  if (!state) return

  const {
    command: AGENT_COMMAND,
    args: AGENT_ARGS,
    cwd: AGENT_CWD,
  } = getAgentConfig()

  // If already connected to a running agent, just resend status
  // This handles frontend reconnections without restarting the agent process
  // Check both .killed and .exitCode to detect crashed processes
  if (
    state.connection &&
    state.process &&
    !state.process.killed &&
    state.process.exitCode === null
  ) {
    logAgent.info('already connected, resending status')
    send(ws, 'status', {
      connected: true,
      agentInfo: state.agentInfo ?? { name: AGENT_COMMAND },
      capabilities: state.agentCapabilities,
      protocolVersion: state.protocolVersion,
    })
    return
  }

  // Kill existing process if any (only if not healthy)
  if (state.process) {
    const stopped = await terminateAgentProcess(state)
    if (!stopped) {
      throw new Error('Failed to stop the previous agent process tree')
    }
  }

  let agentProcess: ReturnType<typeof spawn> | null = null
  try {
    logAgent.info({ command: AGENT_COMMAND, args: AGENT_ARGS }, 'spawning')

    agentProcess = spawn(AGENT_COMMAND, AGENT_ARGS, {
      cwd: AGENT_CWD,
      stdio: ['pipe', 'pipe', 'inherit'],
      env: buildAgentEnv(),
      // Establish a process group on POSIX so cancellation includes tools and
      // shell grandchildren, not only the ACP wrapper process.
      detached: process.platform !== 'win32',
    })

    state.process = agentProcess

    // Clean up state when agent process exits unexpectedly
    agentProcess.on('exit', code => {
      logAgent.info({ exitCode: code }, 'agent process exited')
      // The wrapper may exit before a spawned tool/HTTP worker. Keep the PID
      // long enough to verify the whole process group is gone.
      if (state.process === agentProcess) {
        void terminateAgentProcess(state).then(
          stopped => {
            if (!stopped) {
              logAgent.error(
                { pid: agentProcess?.pid },
                'agent exited but descendants are still alive',
              )
              return
            }
            send(ws, 'status', { connected: false })
          },
          error => {
            logAgent.error(
              { error, pid: agentProcess?.pid },
              'agent descendant termination failed',
            )
          },
        )
      }
    })

    const input = Writable.toWeb(
      agentProcess.stdin!,
    ) as unknown as WritableStream<Uint8Array>
    const output = Readable.toWeb(
      agentProcess.stdout!,
    ) as unknown as ReadableStream<Uint8Array>

    const stream = acp.ndJsonStream(input, output)
    const connection = new acp.ClientSideConnection(
      _agent => createClient(ws, state),
      stream,
    )

    state.connection = connection

    const initResult = await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      // Forward the real client identity/capabilities (audit §8.7). Falls back
      // to the Zed defaults only when the client did not provide any.
      clientInfo: state.clientInfo,
      clientCapabilities: state.clientCapabilities,
    })

    // Pass the raw agentCapabilities through unchanged so present and future
    // capability fields (auth, terminal, ...) reach the client (audit §8.6).
    const agentCaps = initResult.agentCapabilities
    state.agentCapabilities = (agentCaps as AgentCapabilities | null) ?? null
    state.promptCapabilities = agentCaps?.promptCapabilities ?? null
    // Remember the negotiated protocolVersion + agentInfo so reconnects and
    // JSON-RPC initialize responses can forward them to the client (§8.13).
    state.protocolVersion = initResult.protocolVersion
    state.agentInfo =
      (initResult.agentInfo as ClientState['agentInfo'] | null | undefined) ??
      null

    logAgent.info(
      {
        protocolVersion: initResult.protocolVersion,
        loadSession: !!state.agentCapabilities?.loadSession,
        sessionList: !!state.agentCapabilities?.sessionCapabilities?.list,
        sessionResume: !!state.agentCapabilities?.sessionCapabilities?.resume,
        hasMcp: !!state.agentCapabilities?.mcpCapabilities,
      },
      'initialized',
    )

    send(ws, 'status', {
      connected: true,
      agentInfo: initResult.agentInfo,
      capabilities: state.agentCapabilities,
      // Surface the negotiated protocolVersion to downstream clients (audit §8.13).
      protocolVersion: initResult.protocolVersion,
    })

    void connection.closed
      .catch(error => {
        logAgent.warn(
          { error: (error as Error).message },
          'connection closed with an error',
        )
      })
      .then(async () => {
        logAgent.info('connection closed')
        if (state.connection === connection) {
          state.connection = null
          state.sessionId = null
          state.activePrompt = null
          const stopped = await terminateAgentProcess(state)
          if (stopped) {
            send(ws, 'status', { connected: false })
          }
        }
      })
  } catch (error) {
    if (agentProcess && state.process === agentProcess) {
      const stopped = await terminateAgentProcess(state)
      if (!stopped) {
        logAgent.error(
          { pid: agentProcess.pid },
          'connect cleanup could not stop agent process tree',
        )
      }
    }
    logAgent.error({ error: (error as Error).message }, 'connect failed')
    sendJsonRpcError(
      ws,
      state,
      null,
      JSONRPC_INTERNAL_ERROR,
      tf('Failed to connect: {message}', { message: (error as Error).message }),
    )
  }
}

export async function handleDisconnect(ws: WSContext): Promise<void> {
  const state = clients.get(ws)
  if (!state) return

  const stopped = await disconnectAgent(state)
  if (!stopped) {
    throw new Error('Failed to confirm agent process tree stopped')
  }

  send(ws, 'status', { connected: false })
}
