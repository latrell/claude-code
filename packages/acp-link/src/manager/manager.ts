import type { AcpInstance, InstanceSummary, LogEntry } from './types.js'
import { terminateProcessTree } from '../process-tree.js'

function log(tag: string, msg: string) {
  const ts = new Date().toISOString()
  console.log(`[${ts}] [${tag}] ${msg}`)
}

const MAX_LOG_LINES = 2000
export class ProcessManager {
  private instances = new Map<string, AcpInstance>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processes = new Map<string, any>()
  private stopping = new Map<string, Promise<boolean>>()
  private stopRequested = new Set<string>()

  create(group: string, command: string): AcpInstance {
    const id = crypto.randomUUID()
    const instance: AcpInstance = {
      id,
      group,
      command,
      status: 'running',
      pid: undefined,
      startTime: Date.now(),
      exitCode: null,
      logs: [],
      subscribers: new Set(),
    }

    const args = this.parseCommand(command)
    const fullArgs = ['--group', group, ...args]

    const proc = Bun.spawn(['acp-link', ...fullArgs], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...Bun.env, ACP_CHILD: '1' },
      // On POSIX this makes the wrapper a process-group leader, allowing Stop
      // to terminate the agent and every subprocess it launched.
      detached: process.platform !== 'win32',
    })

    instance.pid = proc.pid
    this.instances.set(id, instance)
    this.processes.set(id, proc)
    log(
      'manager',
      `created instance ${id.slice(0, 8)} group=${group} pid=${proc.pid} cmd="acp-link ${fullArgs.join(' ')}"`,
    )

    this.pipeStream(proc.stdout, id, 'stdout')
    this.pipeStream(proc.stderr, id, 'stderr')

    proc.exited.then(async code => {
      const existingStop = this.stopping.get(id)
      const treeStopped = existingStop
        ? await existingStop
        : await terminateProcessTree({
            pid: proc.pid,
            isExited: () => proc.exitCode !== null,
            kill: signal => proc.kill(signal),
          })
      instance.status =
        treeStopped && (this.stopRequested.has(id) || code === 0)
          ? 'stopped'
          : 'failed'
      instance.exitCode = code
      instance.pid = undefined
      this.processes.delete(id)
      this.stopRequested.delete(id)
      if (!treeStopped) {
        log(
          'manager',
          `instance ${id.slice(0, 8)} exited but descendants remain alive`,
        )
      }
      log(
        'manager',
        `instance ${id.slice(0, 8)} ${instance.status} exit=${code}`,
      )
      this.notifyStatus(instance)
    })

    return instance
  }

  async stop(id: string): Promise<boolean> {
    const inFlight = this.stopping.get(id)
    if (inFlight) return inFlight

    const proc = this.processes.get(id)
    if (!proc) {
      const instance = this.instances.get(id)
      return instance !== undefined && instance.status !== 'running'
    }
    log('manager', `stopping instance ${id.slice(0, 8)} pid=${proc.pid}`)
    this.stopRequested.add(id)

    const stopping = terminateProcessTree({
      pid: proc.pid,
      isExited: () => proc.exitCode !== null,
      kill: signal => proc.kill(signal),
    })
      .then(stopped => {
        if (!stopped) {
          this.stopRequested.delete(id)
          log(
            'manager',
            `failed to confirm stop for ${id.slice(0, 8)} pid=${proc.pid}`,
          )
        } else {
          const instance = this.instances.get(id)
          if (instance) instance.status = 'stopped'
        }
        return stopped
      })
      .finally(() => {
        this.stopping.delete(id)
      })

    this.stopping.set(id, stopping)
    return stopping
  }

  remove(id: string): boolean {
    const instance = this.instances.get(id)
    if (!instance) return false
    if (instance.status === 'running') return false
    instance.subscribers.clear()
    this.instances.delete(id)
    log('manager', `removed instance ${id.slice(0, 8)} group=${instance.group}`)
    return true
  }

  list(): InstanceSummary[] {
    return Array.from(this.instances.values()).map(this.toSummary)
  }

  get(id: string): AcpInstance | undefined {
    return this.instances.get(id)
  }

  subscribe(id: string, callback: (entry: LogEntry) => void): () => void {
    const instance = this.instances.get(id)
    if (!instance) return () => {}
    instance.subscribers.add(callback)
    return () => instance.subscribers.delete(callback)
  }

  async shutdownAll(): Promise<void> {
    const running = Array.from(this.processes.entries())
    if (running.length === 0) return

    log('manager', `shutting down ${running.length} running instance(s)...`)
    const results = await Promise.all(running.map(([id]) => this.stop(id)))
    const failed = results.filter(stopped => !stopped).length
    if (failed > 0) {
      throw new Error(`failed to stop ${failed} ACP instance(s)`)
    }
    log('manager', 'all instances confirmed shut down')
  }

  private parseCommand(command: string): string[] {
    const args: string[] = []
    let current = ''
    let inQuote: string | null = null

    for (const ch of command) {
      if (inQuote) {
        if (ch === inQuote) {
          inQuote = null
        } else {
          current += ch
        }
      } else if (ch === '"' || ch === "'") {
        inQuote = ch
      } else if (ch === ' ' || ch === '\t') {
        if (current) {
          args.push(current)
          current = ''
        }
      } else {
        current += ch
      }
    }
    if (current) args.push(current)
    return args
  }

  private pipeStream(
    readable: ReadableStream<Uint8Array>,
    instanceId: string,
    stream: 'stdout' | 'stderr',
  ) {
    const reader = readable.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const processChunk = () => {
      reader
        .read()
        .then(({ done, value }) => {
          if (done) {
            if (buffer) this.appendLog(instanceId, buffer, stream)
            return
          }
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (line) this.appendLog(instanceId, line, stream)
          }
          processChunk()
        })
        .catch(() => {
          // stream ended or error
        })
    }
    processChunk()
  }

  private appendLog(
    instanceId: string,
    text: string,
    stream: 'stdout' | 'stderr',
  ) {
    const instance = this.instances.get(instanceId)
    if (!instance) return

    const entry: LogEntry = { timestamp: Date.now(), stream, text }
    instance.logs.push(entry)
    if (instance.logs.length > MAX_LOG_LINES) {
      instance.logs.splice(0, instance.logs.length - MAX_LOG_LINES)
    }

    for (const sub of instance.subscribers) {
      try {
        sub(entry)
      } catch {
        // subscriber error, remove it
        instance.subscribers.delete(sub)
      }
    }
  }

  private notifyStatus(instance: AcpInstance) {
    const statusEntry: LogEntry = {
      timestamp: Date.now(),
      stream: 'stderr',
      text: `[${instance.status}] exit code: ${instance.exitCode}`,
    }
    for (const sub of instance.subscribers) {
      try {
        sub(statusEntry)
      } catch {
        instance.subscribers.delete(sub)
      }
    }
  }

  private toSummary(inst: AcpInstance): InstanceSummary {
    return {
      id: inst.id,
      group: inst.group,
      command: inst.command,
      status: inst.status,
      pid: inst.pid,
      startTime: inst.startTime,
      exitCode: inst.exitCode,
    }
  }
}
