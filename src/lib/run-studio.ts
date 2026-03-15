export type StudioRun = {
  _id: string
  agentSlug: string
  status: string
  startedAt: number
  lastPrompt?: string
  previewPort?: number
}

export type StudioRunEvent = {
  _id?: string
  type: string
  role?: string
  content?: string
  previewPort?: number
  raw?: unknown
  createdAt: number
}

export type TranscriptMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number
}

export type RunValidationSignal = {
  state: 'pending' | 'validated' | 'needs_review'
  content: string
  createdAt: number
}

export type ActivityItem =
  | {
      id: string
      kind: 'tool'
      title: string
      state: 'input-available' | 'output-available' | 'output-error'
      input?: unknown
      output?: unknown
      createdAt: number
    }
  | {
      id: string
      kind: 'status'
      label: string
      content?: string
      createdAt: number
    }
  | {
      id: string
      kind: 'log'
      label: string
      content: string
      createdAt: number
    }

export function isRunSessionOpen(status?: string | null) {
  return ['starting', 'active', 'idle'].includes(status ?? '')
}

export function isRunStreaming(status?: string | null) {
  return ['starting', 'active'].includes(status ?? '')
}

export function canSendFollowUp(status?: string | null) {
  return ['active', 'idle'].includes(status ?? '')
}

function statusLabelForEvent(event: StudioRunEvent) {
  switch (event.type) {
    case 'agent_start':
      return 'Agent started'
    case 'agent_end':
      return 'Agent finished'
    case 'rpc_response':
      return 'RPC response'
    case 'error':
      return 'Run error'
    case 'validation_pending':
      return 'Validation pending'
    case 'validation_summary':
      return 'Validated output'
    case 'validation_warning':
      return 'Needs review'
    default:
      return event.type.replace(/[_-]+/g, ' ')
  }
}

export function getLatestValidationSignal(events: StudioRunEvent[]) {
  for (const event of [...events].reverse()) {
    if (event.type === 'validation_pending') {
      return {
        state: 'pending',
        content: event.content ?? 'Waiting for validated output.',
        createdAt: event.createdAt,
      } satisfies RunValidationSignal
    }

    if (event.type === 'validation_summary') {
      return {
        state: 'validated',
        content: event.content ?? 'Validated output.',
        createdAt: event.createdAt,
      } satisfies RunValidationSignal
    }

    if (event.type === 'validation_warning') {
      return {
        state: 'needs_review',
        content: event.content ?? 'This run needs review.',
        createdAt: event.createdAt,
      } satisfies RunValidationSignal
    }
  }

  return null
}

export function buildTranscript(
  run: StudioRun | null | undefined,
  events: StudioRunEvent[],
) {
  const transcript: TranscriptMessage[] = []
  let activeAssistantMessage: TranscriptMessage | null = null
  const hasExplicitUserMessages = events.some((event) => event.type === 'user_message')

  if (run?.lastPrompt && !hasExplicitUserMessages) {
    transcript.push({
      id: `synthetic-user-${run._id}`,
      role: 'user',
      content: run.lastPrompt,
      createdAt: run.startedAt,
    })
  }

  for (const event of events) {
    if (event.type === 'user_message' && event.content) {
      activeAssistantMessage = null
      transcript.push({
        id: event._id ?? `user-${event.createdAt}`,
        role: 'user',
        content: event.content,
        createdAt: event.createdAt,
      })
      continue
    }

    if (event.type === 'assistant_delta' && event.content) {
      if (!activeAssistantMessage) {
        activeAssistantMessage = {
          id: event._id ?? `assistant-${event.createdAt}`,
          role: 'assistant',
          content: event.content,
          createdAt: event.createdAt,
        }
        transcript.push(activeAssistantMessage)
      } else {
        activeAssistantMessage.content += event.content
      }
      continue
    }

    if (event.type === 'error' && event.content) {
      activeAssistantMessage = null
      transcript.push({
        id: event._id ?? `system-${event.createdAt}`,
        role: 'system',
        content: event.content,
        createdAt: event.createdAt,
      })
      continue
    }

    if (event.type === 'agent_end') {
      activeAssistantMessage = null
    }
  }

  return transcript
}

export function buildActivityItems(events: StudioRunEvent[]) {
  const activity: ActivityItem[] = []

  for (const event of events) {
    if (event.type === 'assistant_delta' || event.type === 'user_message') {
      continue
    }

    if (event.type === 'tool_call') {
      activity.push({
        id: event._id ?? `tool-call-${event.createdAt}`,
        kind: 'tool',
        title: event.content ?? 'Tool call',
        state: 'input-available',
        input: event.raw,
        createdAt: event.createdAt,
      })
      continue
    }

    if (event.type === 'tool_result') {
      activity.push({
        id: event._id ?? `tool-result-${event.createdAt}`,
        kind: 'tool',
        title: event.content ?? 'Tool result',
        state: 'output-available',
        output: event.raw,
        createdAt: event.createdAt,
      })
      continue
    }

    if (event.type === 'error') {
      activity.push({
        id: event._id ?? `tool-error-${event.createdAt}`,
        kind: 'tool',
        title: 'Run error',
        state: 'output-error',
        output: event.content ?? event.raw,
        createdAt: event.createdAt,
      })
      continue
    }

    if (event.type === 'stdout') {
      const previous = activity[activity.length - 1]
      if (previous?.kind === 'log') {
        previous.content = `${previous.content}\n${event.content ?? ''}`.trim()
        continue
      }

      activity.push({
        id: event._id ?? `log-${event.createdAt}`,
        kind: 'log',
        label: 'stdout',
        content: event.content ?? '',
        createdAt: event.createdAt,
      })
      continue
    }

    activity.push({
      id: event._id ?? `status-${event.type}-${event.createdAt}`,
      kind: 'status',
      label: statusLabelForEvent(event),
      content: event.content,
      createdAt: event.createdAt,
    })
  }

  return activity
}

export function isAwaitingAssistantMessage(
  transcript: TranscriptMessage[],
  status?: string | null,
) {
  if (!isRunStreaming(status)) {
    return false
  }

  const lastUserIndex = transcript.map((message) => message.role).lastIndexOf('user')
  const lastAssistantIndex = transcript
    .map((message) => message.role)
    .lastIndexOf('assistant')

  return lastUserIndex >= 0 && lastAssistantIndex < lastUserIndex
}
