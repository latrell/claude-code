import type {
  Session,
  Environment,
  ControlResponse,
  SessionEvent,
} from '../types'
import { generateMessageUuid } from '../lib/utils'

const BASE = ''

/** A server response that explicitly rejected the request before acceptance. */
export class ApiResponseError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiResponseError'
    this.status = status
  }
}

export function getUuid(): string {
  let uuid = localStorage.getItem('rcs_uuid')
  if (!uuid) {
    uuid = generateMessageUuid()
    localStorage.setItem('rcs_uuid', uuid)
  }
  return uuid
}

export function setUuid(uuid: string): void {
  localStorage.setItem('rcs_uuid', uuid)
}

/** Active API token for Authorization header (set by useTokens) */
let _activeToken: string | null = null

export function setActiveApiToken(token: string | null): void {
  _activeToken = token
}

export function getActiveApiToken(): string | null {
  return _activeToken
}

function getErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback
  const error = (data as Record<string, unknown>).error
  if (typeof error === 'string' && error) return error
  if (!error || typeof error !== 'object') return fallback
  const details = error as Record<string, unknown>
  if (typeof details.message === 'string' && details.message) {
    return details.message
  }
  if (typeof details.type === 'string' && details.type) return details.type
  return fallback
}

async function api<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (_activeToken) {
    headers['Authorization'] = `Bearer ${_activeToken}`
  }

  const uuid = getUuid()
  const sep = path.includes('?') ? '&' : '?'
  const url = `${BASE}${path}${sep}uuid=${encodeURIComponent(uuid)}`
  const opts: RequestInit = { method, headers }
  if (body !== undefined) opts.body = JSON.stringify(body)

  const res = await fetch(url, opts)
  if (!res.ok) {
    let data: unknown
    try {
      data = await res.json()
    } catch {
      // A non-2xx status is already an unambiguous rejection. Its body may be
      // empty or HTML, so parsing must not hide the status classification.
    }
    throw new ApiResponseError(
      res.status,
      getErrorMessage(data, res.statusText || `HTTP ${res.status}`),
    )
  }
  // A malformed 2xx body stays ambiguous: the server may have accepted and
  // started the event before its response became unreadable.
  const data = await res.json()
  return data as T
}

export function apiBind(sessionId: string) {
  return api<void>('POST', '/web/bind', { sessionId })
}

export function apiFetchSessions() {
  return api<Session[]>('GET', '/web/sessions')
}

export function apiFetchAllSessions() {
  return api<Session[]>('GET', '/web/sessions/all')
}

export function apiFetchSession(id: string) {
  return api<Session>('GET', `/web/sessions/${id}`)
}

export function apiFetchSessionHistory(id: string) {
  return api<{ events: SessionEvent[] }>('GET', `/web/sessions/${id}/history`)
}

export function apiFetchEnvironments() {
  return api<Environment[]>('GET', '/web/environments')
}

export function apiSendEvent(sessionId: string, body: Record<string, unknown>) {
  return api<void>('POST', `/web/sessions/${sessionId}/events`, body)
}

export function apiSendControl(sessionId: string, body: ControlResponse) {
  return api<void>('POST', `/web/sessions/${sessionId}/control`, body)
}

export function apiInterrupt(sessionId: string) {
  return api<void>('POST', `/web/sessions/${sessionId}/interrupt`)
}

export function apiCreateSession(body: {
  title?: string
  environment_id?: string
}) {
  return api<Session>('POST', '/web/sessions', body)
}
