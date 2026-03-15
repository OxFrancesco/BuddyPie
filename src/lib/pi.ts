import path from 'node:path'
import {
  BUDDYPIE_REMOTE_PI_ASSETS_DIR,
  BUDDYPIE_REMOTE_PI_SESSIONS_DIR,
  DAYTONA_REPOS_DIR,
  type AgentSlug,
  getAgentProfile,
} from './buddypie-config'

export const LOCAL_PI_ASSETS_DIR = path.resolve(process.cwd(), 'buddy-assets/pi')

export type ParsedRunEvent = {
  type: string
  role?: string
  content?: string
  previewPort?: number
  raw?: unknown
  createdAt: number
}

export function getRemotePiSessionDir(workspaceId: string, agentSlug: AgentSlug) {
  return `${BUDDYPIE_REMOTE_PI_SESSIONS_DIR}/${workspaceId}/${agentSlug}`
}

export function getRemoteRepoPath(repoFullName: string) {
  return `${DAYTONA_REPOS_DIR}/${repoFullName.replace(/\//g, '--').toLowerCase()}`
}

export function getRemoteAgentSkillPaths(agentSlug: AgentSlug) {
  const profile = getAgentProfile(agentSlug)
  return Array.from(new Set(profile.skillSet)).map(
    (skillSetId) => `${BUDDYPIE_REMOTE_PI_ASSETS_DIR}/skills/${skillSetId}/SKILL.md`,
  )
}

export function getRemoteAgentExtensionPaths(agentSlug: AgentSlug) {
  const shared = [
    `${BUDDYPIE_REMOTE_PI_ASSETS_DIR}/extensions/repo-safety.ts`,
    `${BUDDYPIE_REMOTE_PI_ASSETS_DIR}/extensions/preview-detector.ts`,
  ]

  const profileSpecific =
    agentSlug === 'frontend'
      ? [`${BUDDYPIE_REMOTE_PI_ASSETS_DIR}/extensions/frontend-hints.ts`]
      : [`${BUDDYPIE_REMOTE_PI_ASSETS_DIR}/extensions/docs-hints.ts`]

  return [...shared, ...profileSpecific]
}

function quoteShell(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function buildPiRpcCommand(options: {
  agentSlug: AgentSlug
  repoPath: string
  sessionDir: string
  provider?: string
  model?: string
  command?: string
  envVars?: Record<string, string>
}) {
  const skillFlags = getRemoteAgentSkillPaths(options.agentSlug)
    .map((skillPath) => `--skill ${quoteShell(skillPath)}`)
    .join(' ')

  const extensionFlags = getRemoteAgentExtensionPaths(options.agentSlug)
    .map((extensionPath) => `--extension ${quoteShell(extensionPath)}`)
    .join(' ')

  const providerFlags = [
    options.provider ? `--provider ${quoteShell(options.provider)}` : '',
    options.model ? `--model ${quoteShell(options.model)}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const envPrefix = Object.entries(options.envVars ?? {})
    .filter(([, value]) => value.length > 0)
    .map(([key, value]) => `${key}=${quoteShell(value)}`)
    .join(' ')

  return [
    `cd ${quoteShell(options.repoPath)}`,
    `${envPrefix ? `${envPrefix} ` : ''}${options.command ?? 'pi'} --mode rpc --no-skills --no-extensions --session-dir ${quoteShell(options.sessionDir)} ${providerFlags} ${skillFlags} ${extensionFlags}`.trim(),
  ].join(' && ')
}

export function buildAgentPrompt(options: {
  agentSlug: AgentSlug
  repoFullName: string
  repoPath: string
  prompt: string
}) {
  const profile = getAgentProfile(options.agentSlug)
  const executionChecklist = [
    '- Inspect the relevant repository files before you write or edit anything.',
    '- Prefer meaningful repository-backed output over placeholder files, stub content, or no-op edits.',
    '- Before you say the task is done, verify the result with the right evidence: changed files, command output, preview health, or both.',
    '- If no file edits are needed, provide a substantive answer grounded in the files you inspected.',
    ...(options.agentSlug === 'frontend'
      ? [
          '- For frontend work, bias toward a working preview and mention the verified local URL or port when you have one.',
          '- Do not claim a frontend task is complete after only describing a plan if the request required code or preview changes.',
        ]
      : [
          '- For docs work, name concrete file paths, functions, flags, or commands when they matter.',
          '- Do not create placeholder markdown or thin stubs just to satisfy the request.',
        ]),
  ]

  return [
    `BuddyPie runtime context for ${profile.name}:`,
    `- Repository: ${options.repoFullName}`,
    `- Working directory: ${options.repoPath}`,
    `- Agent profile hint: ${profile.promptHint}`,
    `- The sandbox is persistent. Avoid destructive git resets or checkout commands unless the user explicitly requests them.`,
    '',
    'Execution checklist:',
    ...executionChecklist,
    '',
    `User request:`,
    options.prompt.trim(),
  ].join('\n')
}

export function createRpcPrompt(message: string, streamingBehavior?: 'steer' | 'followUp') {
  return JSON.stringify(
    {
      id: `prompt-${Date.now()}`,
      type: 'prompt',
      message,
      ...(streamingBehavior ? { streamingBehavior } : {}),
    },
    null,
    0,
  )
}

export function createRpcAbort() {
  return JSON.stringify({
    id: `abort-${Date.now()}`,
    type: 'abort',
  })
}

export function detectPreviewPort(text: string) {
  const match = text.match(
    /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(?<port>\d{2,5})\b/i,
  )

  if (!match?.groups?.port) {
    return undefined
  }

  return Number(match.groups.port)
}

export function parsePiRpcOutput(chunk: string) {
  const now = Date.now()
  const events: ParsedRunEvent[] = []
  let status: 'active' | 'idle' | 'error' | undefined
  let previewPort = detectPreviewPort(chunk)

  for (const rawLine of chunk.split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }

    try {
      const parsed = JSON.parse(line) as Record<string, any>
      switch (parsed.type) {
        case 'agent_start':
          status = 'active'
          events.push({ type: 'agent_start', raw: parsed, createdAt: now })
          break
        case 'agent_end':
          status = 'idle'
          events.push({ type: 'agent_end', raw: parsed, createdAt: now })
          break
        case 'response': {
          const success = parsed.success !== false
          if (!success) {
            status = 'error'
          }

          events.push({
            type: success ? 'rpc_response' : 'error',
            content: success
              ? parsed.command
                ? `${parsed.command}: ${parsed.success}`
                : 'response: true'
              : parsed.error ?? parsed.message ?? `${parsed.command ?? 'command'} failed`,
            raw: parsed,
            createdAt: now,
          })
          break
        }
        case 'message_update': {
          const assistantEvent = parsed.assistantMessageEvent
          if (assistantEvent?.type === 'text_delta' && assistantEvent.delta) {
            events.push({
              type: 'assistant_delta',
              role: 'assistant',
              content: assistantEvent.delta,
              raw: parsed,
              createdAt: now,
            })
          }
          break
        }
        case 'tool_call':
          events.push({
            type: 'tool_call',
            content: parsed.toolName ?? parsed.name ?? 'tool_call',
            raw: parsed,
            createdAt: now,
          })
          break
        case 'tool_result':
          previewPort ??= detectPreviewPort(JSON.stringify(parsed))
          events.push({
            type: 'tool_result',
            content: parsed.toolName ?? parsed.name ?? 'tool_result',
            raw: parsed,
            createdAt: now,
          })
          break
        case 'error':
          status = 'error'
          events.push({
            type: 'error',
            content: parsed.message ?? 'Unknown PI error',
            raw: parsed,
            createdAt: now,
          })
          break
        default:
          previewPort ??= detectPreviewPort(JSON.stringify(parsed))
          events.push({
            type: parsed.type ?? 'rpc_event',
            raw: parsed,
            createdAt: now,
          })
          break
      }
    } catch {
      previewPort ??= detectPreviewPort(line)
      events.push({
        type: 'stdout',
        content: line,
        createdAt: now,
      })
    }
  }

  return {
    events,
    previewPort,
    status,
  }
}
