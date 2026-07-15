export type ConnectionsViewMode =
  | 'list'
  | 'menu'
  | 'model-pick'
  | 'context-window'
  | 'effort'
  | 'duplicate'
  | 'add'
  | 'edit'
  | 'confirm-delete'
  | 'busy'
  | 'error'

/** The outer dialog only owns Esc on the root connection list. */
export function shouldConnectionsDialogHandleCancel(
  mode: ConnectionsViewMode,
): boolean {
  return mode === 'list'
}

export type ConnectionOAuthStep =
  | 'claude-oauth'
  | 'chatgpt-oauth'
  | 'cursor-oauth'

export type ConnectionOAuthBackTarget = 'kind' | 'cursor-mode'

/** OAuth waiting screens have no Select/Form of their own to handle Esc. */
export function connectionOAuthBackTarget(
  step: ConnectionOAuthStep,
): ConnectionOAuthBackTarget {
  return step === 'cursor-oauth' ? 'cursor-mode' : 'kind'
}
