import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { ProcessManager } from './manager.js'
import { createApp } from './routes.js'
import { t, tf } from '../../../../src/i18n/t.js'

export async function startManager(port: number): Promise<void> {
  const manager = new ProcessManager()
  const app = createApp(manager)

  // Health check
  app.get('/health', c => c.json({ status: 'ok' }))

  let shuttingDown = false
  const shutdown = async () => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(t('Shutting down...'))
    await manager.shutdownAll()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  const server = serve({ fetch: app.fetch, port })
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        tf(
          '\n  Error: port {port} is already in use. Use --port to specify a different port.\n',
          { port },
        ),
      )
    } else {
      console.error(tf('\n  Error: {message}\n', { message: err.message }))
    }
    process.exit(1)
  })

  console.log()
  console.log(t('  🖥️  ACP Manager'))
  console.log()
  console.log(tf('    URL:   http://localhost:{port}', { port }))
  console.log()
  console.log(t('  Press Ctrl+C to stop'))
  console.log()

  // Keep running
  await new Promise(() => {})
}
