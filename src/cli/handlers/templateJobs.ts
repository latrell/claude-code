import { randomUUID } from 'crypto'
import { listTemplates, loadTemplate } from '../../jobs/templates.js'
import {
  createJob,
  readJobState,
  appendJobReply,
  getJobDir,
} from '../../jobs/state.js'
import { t, tf } from '../../i18n/t.js'

/**
 * Entry point for template job commands: `new`, `list`, `reply`.
 * Called from cli.tsx fast-path.
 */
export async function templatesMain(args: string[]): Promise<void> {
  const subcommand = args[0]

  switch (subcommand) {
    case 'list':
      handleList()
      break
    case 'new':
      handleNew(args.slice(1))
      break
    case 'reply':
      handleReply(args.slice(1))
      break
    case 'status':
      handleStatus(args.slice(1))
      break
    default:
      console.error(tf('Unknown template command: {cmd}', { cmd: subcommand }))
      printUsage()
      process.exitCode = 1
  }
}

function printUsage(): void {
  console.log(`
${t('Template Job Commands:')}

  claude job list                    List available templates
  claude job new <template> [args]   Create a new job from a template
  claude job reply <job-id> <text>   Reply to an existing job
  claude job status <job-id>         Show job status
`)
}

function handleStatus(args: string[]): void {
  const jobId = args[0]
  if (!jobId) {
    console.error(t('Usage: claude job status <job-id>'))
    process.exitCode = 1
    return
  }

  const state = readJobState(jobId)
  if (!state) {
    console.error(tf('Job not found: {id}', { id: jobId }))
    process.exitCode = 1
    return
  }

  console.log(`Job: ${state.jobId}`)
  console.log(`  Template: ${state.templateName}`)
  console.log(`  Status: ${state.status}`)
  console.log(`  Created: ${state.createdAt}`)
  console.log(`  Updated: ${state.updatedAt}`)
  console.log(`  Args: ${state.args.join(' ') || '(none)'}`)
}

function handleList(): void {
  const templates = listTemplates()

  if (templates.length === 0) {
    console.log(t('No templates found.'))
    console.log(
      t('Place .md files in .claude/templates/ or ~/.claude/templates/'),
    )
    return
  }

  console.log(
    tf('{count} template{suffix} found:', {
      count: templates.length,
      suffix: templates.length > 1 ? 's' : '',
    }) + '\n',
  )

  for (const t of templates) {
    console.log(`  ${t.name}`)
    console.log(`    ${t.description}`)
    console.log(`    Path: ${t.filePath}`)
    console.log()
  }
}

function handleNew(args: string[]): void {
  const templateName = args[0]
  if (!templateName) {
    console.error(t('Usage: claude job new <template> [args...]'))
    process.exitCode = 1
    return
  }

  const template = loadTemplate(templateName)
  if (!template) {
    console.error(tf('Template not found: {name}', { name: templateName }))
    console.log('\n' + t('Available templates:'))
    for (const t of listTemplates()) {
      console.log(`  ${t.name}`)
    }
    process.exitCode = 1
    return
  }

  const jobId = randomUUID().slice(0, 8)
  const inputText = args.slice(1).join(' ')
  const rawContent = `---\n${Object.entries(template.frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}\n---\n${template.content}`

  const dir = createJob(
    jobId,
    templateName,
    rawContent,
    inputText,
    args.slice(1),
  )

  console.log(tf('Job created: {id}', { id: jobId }))
  console.log(tf('  Template: {name}', { name: templateName }))
  console.log(tf('  Directory: {dir}', { dir }))
  if (inputText) {
    console.log(tf('  Input: {text}', { text: inputText }))
  }
}

function handleReply(args: string[]): void {
  const jobId = args[0]
  const text = args.slice(1).join(' ')

  if (!jobId || !text) {
    console.error(t('Usage: claude job reply <job-id> <text>'))
    process.exitCode = 1
    return
  }

  const state = readJobState(jobId)
  if (!state) {
    console.error(tf('Job not found: {id}', { id: jobId }))
    process.exitCode = 1
    return
  }

  const ok = appendJobReply(jobId, text)
  if (ok) {
    console.log(tf('Reply added to job {id}', { id: jobId }))
    console.log(tf('  Directory: {dir}', { dir: getJobDir(jobId) }))
  } else {
    console.error(tf('Failed to append reply to job {id}', { id: jobId }))
    process.exitCode = 1
  }
}
