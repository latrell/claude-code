import { useContext, useEffect } from 'react'
import stripAnsi from 'strip-ansi'
import { OSC, osc } from '../core/termio/osc.js'
import { TerminalWriteContext } from './useTerminalNotification.js'

/**
 * Declaratively set the terminal tab/window title.
 *
 * Pass a string to set the title. ANSI escape sequences are stripped
 * automatically so callers don't need to know about terminal encoding.
 * Pass `null` to opt out — the hook becomes a no-op and leaves the
 * terminal title untouched.
 *
 * Writes OSC 0 (set title+icon) via Ink's stdout on every platform — Ink
 * already drives the whole UI with VT sequences, so any terminal rendering
 * us accepts OSC. Emitting it on win32 too matters for hosts that only
 * parse the output stream and never see console API calls: VS Code's tab
 * title (`${sequence}`), SSH remotes, tmux passthrough. On Windows,
 * additionally sets `process.title` (SetConsoleTitleW under both Node and
 * Bun) so legacy conhost windows without VT parsing keep working.
 */
export function useTerminalTitle(title: string | null): void {
  const writeRaw = useContext(TerminalWriteContext)

  useEffect(() => {
    if (title === null || !writeRaw) return

    const clean = stripAnsi(title)

    if (process.platform === 'win32') {
      process.title = clean
    }
    writeRaw(osc(OSC.SET_TITLE_AND_ICON, clean))
  }, [title, writeRaw])
}
