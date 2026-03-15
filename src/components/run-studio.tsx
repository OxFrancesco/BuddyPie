import * as React from 'react'
import {
  Bot,
  Code,
  ExternalLink,
  Eye,
  FileText,
  LoaderCircle,
  RefreshCcw,
  Square,
  TerminalSquare,
} from 'lucide-react'
import { useWallet } from '~/components/wallet-provider'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '~/components/ai-elements/conversation'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '~/components/ai-elements/message'
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '~/components/ai-elements/prompt-input'
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '~/components/ai-elements/tool'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { getAgentProfile, type AgentSlug } from '~/lib/buddypie-config'
import {
  buildActivityItems,
  buildTranscript,
  canSendFollowUp,
  getLatestValidationSignal,
  isAwaitingAssistantMessage,
  isRunSessionOpen,
  isRunStreaming,
  type StudioRun,
  type StudioRunEvent,
} from '~/lib/run-studio'
import { cn } from '~/lib/utils'

type WorkspaceSnapshot = {
  _id: string
  repoFullName: string
  branch?: string
  previewPort?: number
  sandboxName?: string
  status?: string
}

type AgentOption = {
  slug: AgentSlug
  label: string
  icon: React.ComponentType<{ className?: string }>
}

type RunStudioProps = {
  workspaceId: string
  workspace?: WorkspaceSnapshot | null
  run?: StudioRun | null
  events?: StudioRunEvent[] | null
  headerActions?: React.ReactNode
  allowNewRun?: boolean
}

const AGENT_OPTIONS: AgentOption[] = [
  { slug: 'frontend', label: 'Frontend', icon: Code },
  { slug: 'docs', label: 'Docs', icon: FileText },
]

function getApiErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') {
    return fallback
  }

  const error =
    'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : null
  const details =
    'details' in payload && typeof payload.details === 'string'
      ? payload.details
      : null

  if (error && details && !error.includes(details)) {
    return `${error} ${details}`
  }

  return error ?? details ?? fallback
}

function formatStudioTimestamp(value?: number) {
  if (!value) {
    return 'Just now'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(value)
}

function formatRunStatus(status?: string | null) {
  switch (status) {
    case 'starting':
      return 'Starting'
    case 'active':
      return 'Working'
    case 'idle':
      return 'Ready'
    case 'aborted':
      return 'Aborted'
    case 'completed':
      return 'Completed'
    case 'error':
      return 'Error'
    default:
      return 'Idle'
  }
}

function formatValidationState(state?: 'pending' | 'validated' | 'needs_review' | null) {
  switch (state) {
    case 'pending':
      return 'Review pending'
    case 'validated':
      return 'Validated'
    case 'needs_review':
      return 'Needs review'
    default:
      return null
  }
}

function ActivityFeed({
  items,
  runStatus,
}: {
  items: ReturnType<typeof buildActivityItems>
  runStatus?: string | null
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [stickToBottom, setStickToBottom] = React.useState(true)

  React.useEffect(() => {
    const node = scrollRef.current
    if (!node) {
      return
    }

    const handleScroll = () => {
      const distanceFromBottom =
        node.scrollHeight - node.scrollTop - node.clientHeight
      setStickToBottom(distanceFromBottom < 24)
    }

    handleScroll()
    node.addEventListener('scroll', handleScroll)
    return () => node.removeEventListener('scroll', handleScroll)
  }, [])

  React.useEffect(() => {
    if (!stickToBottom) {
      return
    }

    const node = scrollRef.current
    if (!node) {
      return
    }

    node.scrollTo({
      top: node.scrollHeight,
      behavior: 'smooth',
    })
  }, [items, stickToBottom])

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto border-t-2 border-border"
    >
      <div className="flex min-h-full flex-col gap-3 px-4 py-4">
        {items.length === 0 ? (
          <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2 border-2 border-dashed border-border bg-card px-4 py-6 text-center">
            <TerminalSquare className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium">No live activity yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {isRunStreaming(runStatus)
                ? 'Polling is active. Tool calls and stdout will appear here.'
                : 'Start a run or send a follow-up to populate the activity log.'}
            </p>
          </div>
        ) : (
          items.slice(-120).map((item) => {
            if (item.kind === 'tool') {
              return (
                <Tool
                  key={item.id}
                  defaultOpen={item.state !== 'input-available'}
                >
                  <ToolHeader
                    title={item.title}
                    type={`tool-${item.title}`}
                    state={item.state}
                  />
                  <ToolContent>
                    <ToolInput input={item.input} />
                    <ToolOutput
                      output={
                        item.output == null ? null : (
                          <pre className="overflow-x-auto whitespace-pre-wrap">
                            {typeof item.output === 'string'
                              ? item.output
                              : JSON.stringify(item.output, null, 2)}
                          </pre>
                        )
                      }
                      errorText={
                        item.state === 'output-error' ? (
                          <pre className="overflow-x-auto whitespace-pre-wrap">
                            {typeof item.output === 'string'
                              ? item.output
                              : JSON.stringify(item.output, null, 2)}
                          </pre>
                        ) : undefined
                      }
                    />
                  </ToolContent>
                </Tool>
              )
            }

            return (
              <div
                key={item.id}
                className="border-2 border-border bg-card px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-muted-foreground">
                    {item.label}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {formatStudioTimestamp(item.createdAt)}
                  </span>
                </div>
                {item.content ? (
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-5 text-foreground">
                    {item.content}
                  </pre>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export function RunStudio({
  workspaceId,
  workspace,
  run,
  events,
  headerActions,
  allowNewRun = true,
}: RunStudioProps) {
  const wallet = useWallet()
  const [draft, setDraft] = React.useState('')
  const [selectedAgent, setSelectedAgent] = React.useState<AgentSlug>('frontend')
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busyAction, setBusyAction] = React.useState<string | null>(null)
  const previewPort = workspace?.previewPort ?? run?.previewPort ?? null
  const pollInFlightRef = React.useRef(false)
  const resolvedPreviewPortRef = React.useRef<number | null>(null)
  const transcript = React.useMemo(
    () => buildTranscript(run ?? null, events ?? []),
    [events, run],
  )
  const activityItems = React.useMemo(
    () => buildActivityItems(events ?? []),
    [events],
  )
  const deferredTranscript = React.useDeferredValue(transcript)
  const deferredActivity = React.useDeferredValue(activityItems)
  const sessionOpen = isRunSessionOpen(run?.status)
  const canFollowUp = canSendFollowUp(run?.status)
  const validationSignal = React.useMemo(
    () => getLatestValidationSignal(events ?? []),
    [events],
  )
  const waitingForAssistant = isAwaitingAssistantMessage(
    deferredTranscript,
    run?.status,
  )
  const activeAgent = React.useMemo(
    () =>
      AGENT_OPTIONS.find((option) => option.slug === selectedAgent) ??
      AGENT_OPTIONS[0],
    [selectedAgent],
  )

  React.useEffect(() => {
    if (!run?.agentSlug) {
      return
    }

    if (run.agentSlug === 'frontend' || run.agentSlug === 'docs') {
      setSelectedAgent(run.agentSlug)
    }
  }, [run?.agentSlug])

  const requestJson = React.useCallback(
    async (
      url: string,
      init?: RequestInit,
      options?: {
        usePaidFetch?: boolean
        busyAction?: string | null
        silent?: boolean
      },
    ) => {
      if (!options?.silent) {
        setError(null)
      }
      if (options?.busyAction) {
        setBusyAction(options.busyAction)
      }

      try {
        const response = options?.usePaidFetch
          ? await wallet.fetchWithPayment(url, init)
          : await fetch(url, {
              credentials: 'same-origin',
              ...init,
            })
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(getApiErrorMessage(payload, 'Request failed'))
        }
        return payload
      } catch (nextError) {
        if (!options?.silent) {
          setError(
            nextError instanceof Error ? nextError.message : 'Request failed',
          )
        }
        return null
      } finally {
        if (options?.busyAction) {
          setBusyAction(null)
        }
      }
    },
    [wallet],
  )

  const refreshPreview = React.useCallback(
    async (silent = false) => {
      if (!workspaceId) {
        return
      }

      const payload = await requestJson(
        `/api/workspaces/${workspaceId}/preview-link`,
        {
          method: 'POST',
        },
        {
          busyAction: silent ? null : 'preview',
          silent,
        },
      )

      if (payload) {
        setPreviewUrl(payload.url ?? null)
        resolvedPreviewPortRef.current = payload.port ?? null
      }
    },
    [requestJson, workspaceId],
  )

  React.useEffect(() => {
    if (!previewPort) {
      setPreviewUrl(null)
      resolvedPreviewPortRef.current = null
      return
    }

    if (previewUrl && resolvedPreviewPortRef.current === previewPort) {
      return
    }

    void refreshPreview(true)
  }, [previewPort, previewUrl, refreshPreview])

  const pollRun = React.useCallback(async () => {
    if (!run?._id || !isRunStreaming(run.status) || pollInFlightRef.current) {
      return
    }

    pollInFlightRef.current = true

    try {
      await requestJson(
        `/api/runs/${run._id}/refresh`,
        {
          method: 'POST',
        },
        {
          silent: true,
        },
      )
    } finally {
      pollInFlightRef.current = false
    }
  }, [requestJson, run?._id, run?.status])

  React.useEffect(() => {
    if (!run?._id || !isRunStreaming(run.status)) {
      return
    }

    void pollRun()
    const interval = window.setInterval(() => {
      void pollRun()
    }, 1800)

    return () => window.clearInterval(interval)
  }, [pollRun, run?._id, run?.status])

  const handleSubmit = async ({ text }: PromptInputMessage) => {
    const nextPrompt = text.trim()
    if (!nextPrompt) {
      return
    }

    if (sessionOpen) {
      if (!run?._id || !canFollowUp) {
        return
      }

      const payload = await requestJson(
        `/api/runs/${run._id}/messages`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: nextPrompt }),
        },
        {
          busyAction: 'submit',
        },
      )

      if (payload) {
        React.startTransition(() => setDraft(''))
      }

      return
    }

    if (!allowNewRun) {
      return
    }

    const payload = await requestJson(
      `/api/workspaces/${workspaceId}/runs`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentSlug: selectedAgent,
          prompt: nextPrompt,
          payerWallet: wallet.account ?? undefined,
        }),
      },
      {
        busyAction: 'submit',
        usePaidFetch: true,
      },
    )

    if (payload) {
      React.startTransition(() => setDraft(''))
    }
  }

  const handleRefreshRun = async () => {
    if (!run?._id) {
      return
    }

    await requestJson(
      `/api/runs/${run._id}/refresh`,
      {
        method: 'POST',
      },
      {
        busyAction: 'refresh',
      },
    )
  }

  const handleAbort = async () => {
    if (!run?._id) {
      return
    }

    await requestJson(
      `/api/runs/${run._id}/abort`,
      {
        method: 'POST',
      },
      {
        busyAction: 'abort',
      },
    )
  }

  const composerStatus =
    busyAction === 'submit'
      ? sessionOpen
        ? 'streaming'
        : 'submitting'
      : 'ready'

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.88fr)_minmax(24rem,1.12fr)]">
      <Card className="flex min-h-[44rem] flex-col">
        <CardHeader className="border-b-2 border-border">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono uppercase">
                  Session
                </Badge>
                <Badge
                  variant={sessionOpen ? 'secondary' : 'outline'}
                  className="font-mono uppercase"
                >
                  {formatRunStatus(run?.status)}
                </Badge>
                {validationSignal ? (
                  <Badge
                    variant={
                      validationSignal.state === 'needs_review'
                        ? 'destructive'
                        : validationSignal.state === 'validated'
                          ? 'secondary'
                          : 'outline'
                    }
                    className="font-mono uppercase"
                  >
                    {formatValidationState(validationSignal.state)}
                  </Badge>
                ) : null}
                <Badge variant="outline" className="font-mono uppercase">
                  {activeAgent.label}
                </Badge>
              </div>
              <CardTitle>{workspace?.repoFullName ?? 'BuddyPie session'}</CardTitle>
              <CardDescription>
                {run
                  ? `${formatStudioTimestamp(run.startedAt)} · ${getAgentProfile(
                      activeAgent.slug,
                    ).priceLabel}`
                  : 'Pay once, keep the session open, and keep sending follow-ups.'}
              </CardDescription>
            </div>
            {headerActions ? (
              <div className="flex flex-wrap items-center gap-2">
                {headerActions}
              </div>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col px-0 pb-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-border px-4 py-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono uppercase tracking-[0.18em]">
                {workspace?.sandboxName ?? 'sandbox pending'}
              </span>
              <span className="hidden sm:inline">/</span>
              <span className="font-mono uppercase tracking-[0.18em]">
                {workspace?.branch ?? 'branch unknown'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {wallet.account || sessionOpen ? null : (
                <span>Connect a Base Sepolia wallet to start.</span>
              )}
              {isRunStreaming(run?.status) ? (
                <span className="flex items-center gap-1.5 font-mono uppercase tracking-[0.16em]">
                  <LoaderCircle className="size-3 animate-spin" />
                  Polling live
                </span>
              ) : null}
            </div>
          </div>

          {validationSignal?.content ? (
            <div
              className={cn(
                'border-b-2 px-4 py-3 text-sm',
                validationSignal.state === 'needs_review'
                  ? 'border-destructive bg-destructive/10 text-destructive'
                  : 'border-border bg-muted/30 text-foreground',
              )}
            >
              {validationSignal.content}
            </div>
          ) : null}

          <Conversation>
            <ConversationContent>
              {deferredTranscript.length === 0 ? (
                <ConversationEmptyState
                  icon={<Bot className="size-5 text-muted-foreground" />}
                  title="Start a paid agent run"
                  description="Describe the change, then BuddyPie will stream the transcript and activity here."
                >
                  <div className="flex flex-wrap justify-center gap-2 pt-2">
                    {AGENT_OPTIONS.map((option) => (
                      <Badge
                        key={option.slug}
                        variant={
                          selectedAgent === option.slug ? 'secondary' : 'outline'
                        }
                        className="font-mono uppercase"
                      >
                        {option.label}
                      </Badge>
                    ))}
                  </div>
                </ConversationEmptyState>
              ) : (
                deferredTranscript.map((message) => (
                  <Message
                    key={message.id}
                    from={message.role}
                    className={message.role === 'system' ? 'my-2' : undefined}
                  >
                    <MessageContent>
                      {message.role !== 'system' ? (
                        <div className="flex items-center justify-between gap-3 text-[0.68rem] font-mono uppercase tracking-[0.18em] opacity-70">
                          <span>
                            {message.role === 'assistant'
                              ? 'BuddyPie'
                              : 'You'}
                          </span>
                          <span>{formatStudioTimestamp(message.createdAt)}</span>
                        </div>
                      ) : null}
                      <MessageResponse>{message.content}</MessageResponse>
                    </MessageContent>
                  </Message>
                ))
              )}

              {waitingForAssistant ? (
                <Message from="assistant">
                  <MessageContent>
                    <div className="flex items-center gap-2 text-[0.68rem] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                      <LoaderCircle className="size-3 animate-spin" />
                      Working in sandbox
                    </div>
                    <MessageResponse>
                      BuddyPie is still collecting output from the running agent.
                    </MessageResponse>
                  </MessageContent>
                </Message>
              ) : null}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <div className="border-t-2 border-border bg-card px-4 py-4">
            {error ? (
              <div className="mb-3 border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <PromptInput onSubmit={handleSubmit}>
              <PromptInputBody>
                <PromptInputTextarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={
                    sessionOpen
                      ? canFollowUp
                        ? 'Send a follow-up instruction.'
                        : 'This session is still starting up.'
                      : 'Describe what the agent should build or change.'
                  }
                  disabled={
                    busyAction === 'submit' ||
                    (!sessionOpen && !allowNewRun) ||
                    (sessionOpen && !canFollowUp)
                  }
                />
              </PromptInputBody>
              <PromptInputFooter>
                <PromptInputTools>
                  {sessionOpen ? (
                    <PromptInputButton type="button" disabled>
                      {activeAgent.label}
                    </PromptInputButton>
                  ) : (
                    AGENT_OPTIONS.map((option) => {
                      const Icon = option.icon
                      return (
                        <PromptInputButton
                          key={option.slug}
                          type="button"
                          variant={
                            selectedAgent === option.slug ? 'default' : 'outline'
                          }
                          onClick={() => setSelectedAgent(option.slug)}
                        >
                          <Icon className="size-4" />
                          {option.label}
                        </PromptInputButton>
                      )
                    })
                  )}
                </PromptInputTools>
                <PromptInputSubmit
                  disabled={
                    !draft.trim() ||
                    busyAction === 'submit' ||
                    (!sessionOpen && (!allowNewRun || !wallet.account)) ||
                    (sessionOpen && !canFollowUp)
                  }
                  status={composerStatus}
                >
                  {sessionOpen ? 'Send' : 'Run'}
                </PromptInputSubmit>
              </PromptInputFooter>
            </PromptInput>
          </div>
        </CardContent>
      </Card>

      <div className="flex min-h-[44rem] flex-col gap-6">
        <Card className="flex min-h-[28rem] flex-1 flex-col">
          <CardHeader className="border-b-2 border-border">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono uppercase">
                    Preview
                  </Badge>
                  {previewPort ? (
                    <Badge variant="outline" className="font-mono uppercase">
                      :{previewPort}
                    </Badge>
                  ) : null}
                </div>
                <CardTitle>Live preview</CardTitle>
                <CardDescription>
                  Dev server output from the workspace sandbox.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleRefreshRun()}
                  disabled={!run?._id || busyAction === 'refresh'}
                >
                  <RefreshCcw className="size-4" />
                  {busyAction === 'refresh' ? 'Refreshing' : 'Refresh'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void refreshPreview()}
                  disabled={!workspaceId || busyAction === 'preview'}
                >
                  <Eye className="size-4" />
                  {busyAction === 'preview' ? 'Loading' : 'Preview'}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void handleAbort()}
                  disabled={!run?._id || busyAction === 'abort'}
                >
                  <Square className="size-4" />
                  Abort
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex min-h-0 flex-1 flex-col px-0 pb-0">
            <div className="flex items-center gap-2 border-b-2 border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              <Button
                size="icon-xs"
                variant="outline"
                type="button"
                onClick={() => void refreshPreview()}
                disabled={!workspaceId || busyAction === 'preview'}
              >
                <RefreshCcw className="size-3" />
              </Button>
              <div className="flex min-w-0 flex-1 items-center gap-2 border-2 border-border bg-card px-3 py-1.5">
                <span className="font-mono uppercase tracking-[0.18em]">
                  /
                </span>
                <span className="truncate font-mono">
                  {workspace?.repoFullName ?? 'preview pending'}
                </span>
              </div>
              {previewUrl ? (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    'inline-flex h-7 items-center gap-1 border-2 border-border px-2 text-xs font-medium',
                    'transition-colors hover:bg-muted',
                  )}
                >
                  <ExternalLink className="size-3.5" />
                  Open
                </a>
              ) : null}
            </div>

            {previewUrl ? (
              <iframe
                src={previewUrl}
                title="BuddyPie live preview"
                className="min-h-[24rem] flex-1 border-0 bg-background"
              />
            ) : (
              <div className="flex min-h-[24rem] flex-1 items-center justify-center bg-background p-6">
                <div className="w-full max-w-md border-2 border-border bg-card px-5 py-5 shadow-[6px_6px_0_0_oklch(0.92_0_0_/_0.08)]">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <LoaderCircle
                      className={cn(
                        'size-4',
                        isRunStreaming(run?.status) && 'animate-spin',
                      )}
                    />
                    {previewPort
                      ? 'Preview URL is readying'
                      : 'Getting preview ready'}
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {previewPort
                      ? 'BuddyPie detected a preview port and is requesting a signed URL.'
                      : 'Once the agent starts a dev server, the preview will appear here automatically.'}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge variant="outline" className="font-mono uppercase">
                      {formatRunStatus(run?.status)}
                    </Badge>
                    {workspace?.branch ? (
                      <Badge variant="outline" className="font-mono uppercase">
                        {workspace.branch}
                      </Badge>
                    ) : null}
                    <Badge variant="outline" className="font-mono uppercase">
                      {activeAgent.label}
                    </Badge>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex min-h-[15rem] flex-1 flex-col">
          <CardHeader className="border-b-2 border-border">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono uppercase">
                    Logs
                  </Badge>
                  <Badge variant="outline" className="font-mono uppercase">
                    {deferredActivity.length} events
                  </Badge>
                </div>
                <CardTitle>Activity stream</CardTitle>
                <CardDescription>
                  Tool calls, stdout, and transport events from the live run.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col px-0 pb-0">
            <ActivityFeed items={deferredActivity} runStatus={run?.status} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
