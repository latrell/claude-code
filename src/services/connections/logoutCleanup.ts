/**
 * Logout hook: wipes the connection registry and connection-scoped
 * credential files. The unscoped stores (secure storage, default ChatGPT
 * auth file, ccb-provider-auth.json) are cleared by performLogout itself.
 */

import { removeChatGPTAuth } from '../api/openai/chatgptAuth.js'
import { removeCursorOAuth } from '../api/cursor/cursorOAuth.js'
import { logError } from '../../utils/log.js'
import { clearAllConnections, listConnections } from './store.js'

export async function clearAllConnectionsOnLogout(): Promise<void> {
  try {
    for (const connection of listConnections()) {
      if (
        connection.kind === 'chatgpt-oauth' &&
        connection.credentialRef &&
        connection.credentialRef !== 'default'
      ) {
        await removeChatGPTAuth(connection.credentialRef).catch(() => {})
      }
      if (
        connection.kind === 'cursor' &&
        connection.credentialRef &&
        connection.credentialRef !== 'default'
      ) {
        await removeCursorOAuth(connection.credentialRef).catch(() => {})
      }
    }
    clearAllConnections()
  } catch (err) {
    logError(err)
  }
}
