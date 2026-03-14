import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api as generatedApi } from '../../../../convex/_generated/api'
import { useWallet } from '~/components/wallet-provider'
import { Code, FileText, Send, ChevronDown } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Separator } from '~/components/ui/separator'
import { Textarea } from '~/components/ui/textarea'
import { cn } from '~/lib/utils'

const AGENTS = [
  { slug: 'frontend' as const, label: 'Frontend', icon: Code },
  { slug: 'docs' as const, label: 'Docs', icon: FileText },
]

const api = generatedApi as any

type GitFileState = {
  name: string
  staging: string
  worktree: string
  extra: string
}

type GitState = {
  currentBranch: string
  ahead: number
  behind: number
  branchPublished: boolean
  dirty: boolean
  branches: string[]
  fileStatus: GitFileState[]
}

type PreviewLayout = 'inline' | 'sidepanel' | 'split'

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

export const Route = createFileRoute('/_authed/workspaces/$workspaceId')({
  component: WorkspaceDetailPage,
})

function WorkspaceDetailPage() {
  const { workspaceId } = Route.useParams()
  const wallet = useWallet()
  const detail = useQuery(api.buddypie.workspaceDetail, { workspaceId })
  const [prompt, setPrompt] = React.useState('')
  const [selectedAgent, setSelectedAgent] = React.useState(AGENTS[0])
  const [agentSelectorOpen, setAgentSelectorOpen] = React.useState(false)
  const [followUp, setFollowUp] = React.useState('')
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [previewLayout, setPreviewLayout] =
    React.useState<PreviewLayout>('sidepanel')
  const [busyAction, setBusyAction] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [gitState, setGitState] = React.useState<GitState | null>(null)
  const [branchName, setBranchName] = React.useState('')
  const [commitMessage, setCommitMessage] = React.useState('')
  const [prTitle, setPrTitle] = React.useState('')
  const [prBody, setPrBody] = React.useState('')
  const [selectedFiles, setSelectedFiles] = React.useState<
    Record<string, boolean>
  >({})

  const activeRun = detail?.activeRun ?? null
  const defaultBranch = detail?.repository?.defaultBranch ?? 'main'
  const selectorRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        selectorRef.current &&
        !selectorRef.current.contains(event.target as Node)
      ) {
        setAgentSelectorOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedFileNames =
    gitState?.fileStatus
      .filter((file) => selectedFiles[file.name])
      .map((file) => file.name) ?? []

  React.useEffect(() => {
    if (!gitState) {
      return
    }

    setSelectedFiles((current) => {
      const nextSelection: Record<string, boolean> = {}
      for (const file of gitState.fileStatus) {
        nextSelection[file.name] = current[file.name] ?? true
      }
      return nextSelection
    })
  }, [gitState])

  const doJsonAction = async (
    url: string,
    init?: RequestInit,
    usePaidFetch?: boolean,
  ) => {
    setBusyAction(url)
    setError(null)
    try {
      const response = usePaidFetch
        ? await wallet.fetchWithPayment(url, init)
        : await fetch(url, {
            credentials: 'same-origin',
            ...init,
          })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, 'Request failed'))
      }
      if (payload?.git) {
        setGitState(payload.git)
      }
      return payload
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Request failed',
      )
      return null
    } finally {
      setBusyAction(null)
    }
  }

  const refreshGitState = async (silent = false) => {
    if (!detail?.workspace?.repoPath) {
      setGitState(null)
      return
    }

    if (!silent) {
      setBusyAction('/git/status')
      setError(null)
    }

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/git/status`,
        {
          credentials: 'same-origin',
        },
      )
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, 'Failed to load git state'))
      }
      setGitState(payload.git)
    } catch (nextError) {
      if (!silent) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Failed to load git state',
        )
      }
    } finally {
      if (!silent) {
        setBusyAction(null)
      }
    }
  }

  React.useEffect(() => {
    let cancelled = false

    const loadGitState = async () => {
      if (!detail?.workspace?.repoPath) {
        setGitState(null)
        return
      }

      const response = await fetch(
        `/api/workspaces/${workspaceId}/git/status`,
        {
          credentials: 'same-origin',
        },
      )
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, 'Failed to load git state'))
      }

      if (!cancelled) {
        setGitState(payload.git)
      }
    }

    void loadGitState().catch((nextError) => {
      if (!cancelled) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Failed to load git state',
        )
      }
    })

    return () => {
      cancelled = true
    }
  }, [detail?.workspace?.repoPath, workspaceId])

  const startRun = async (agentSlug: 'frontend' | 'docs') => {
    if (!prompt.trim()) {
      setError('Enter a prompt before starting a run.')
      return
    }

    await doJsonAction(
      `/api/workspaces/${workspaceId}/runs`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentSlug,
          prompt,
          payerWallet: wallet.account ?? undefined,
        }),
      },
      true,
    )
    setPrompt('')
  }

  const syncRepo = async () => {
    const payload = await doJsonAction(`/api/workspaces/${workspaceId}/sync`, {
      method: 'POST',
    })
    if (payload) {
      await refreshGitState(true)
    }
  }

  const refreshPreview = async () => {
    const payload = await doJsonAction(
      `/api/workspaces/${workspaceId}/preview-link`,
      {
        method: 'POST',
      },
    )
    if (payload?.url) {
      setPreviewUrl(payload.url)
    }
  }

  const sendMessage = async () => {
    if (!activeRun || !followUp.trim()) {
      return
    }

    await doJsonAction(`/api/runs/${activeRun._id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: followUp }),
    })
    setFollowUp('')
  }

  const abortActiveRun = async () => {
    if (!activeRun) {
      return
    }
    await doJsonAction(`/api/runs/${activeRun._id}/abort`, {
      method: 'POST',
    })
  }

  const refreshRunState = async () => {
    if (!activeRun) {
      return
    }
    await doJsonAction(`/api/runs/${activeRun._id}/refresh`, {
      method: 'POST',
    })
  }

  const createBranch = async () => {
    if (!branchName.trim()) {
      setError('Enter a branch name first.')
      return
    }

    const payload = await doJsonAction(
      `/api/workspaces/${workspaceId}/git/branch`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          branchName,
          checkout: true,
        }),
      },
    )
    if (payload) {
      setBranchName('')
    }
  }

  const commitChanges = async () => {
    if (!commitMessage.trim()) {
      setError('Enter a commit message first.')
      return
    }

    if (selectedFileNames.length === 0) {
      setError('Select at least one changed file to commit.')
      return
    }

    const payload = await doJsonAction(
      `/api/workspaces/${workspaceId}/git/commit`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: commitMessage,
          files: selectedFileNames,
        }),
      },
    )

    if (payload) {
      setCommitMessage('')
      if (!prTitle.trim()) {
        setPrTitle(commitMessage)
      }
    }
  }

  const pushChanges = async () => {
    await doJsonAction(`/api/workspaces/${workspaceId}/git/push`, {
      method: 'POST',
    })
  }

  const createPullRequest = async () => {
    if (!prTitle.trim()) {
      setError('Enter a pull request title first.')
      return
    }

    await doJsonAction(`/api/workspaces/${workspaceId}/git/pull-request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: prTitle,
        body: prBody || undefined,
        baseBranch: defaultBranch,
        draft: true,
      }),
    })
  }

  const isPreviewInSidebar =
    previewLayout === 'sidepanel' || previewLayout === 'split'
  const previewViewportClass =
    previewLayout === 'split'
      ? 'h-[30rem] xl:h-[calc(100vh-12rem)] xl:min-h-[32rem]'
      : previewLayout === 'sidepanel'
        ? 'h-[28rem] xl:h-[calc(100vh-16rem)] xl:min-h-[24rem]'
        : 'h-[30rem]'

  const previewPanel = (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Preview panel</CardTitle>
        <CardDescription>
          Live website output from the sandbox dev server.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {previewUrl ? (
          <>
            <div className="overflow-hidden border-2 border-foreground bg-background">
              <iframe
                src={previewUrl}
                title="BuddyPie preview website"
                className={cn('w-full border-0', previewViewportClass)}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-2 border-border px-3 py-2 text-xs">
              <span className="font-mono text-muted-foreground">
                Preview source
              </span>
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono underline"
              >
                Open in new tab
              </a>
            </div>
          </>
        ) : (
          <p className="border-2 border-border px-3 py-2 text-sm text-muted-foreground">
            No preview URL generated yet. Click refresh preview after a dev
            server starts.
          </p>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div
      className={cn(
        'grid gap-6',
        previewLayout === 'sidepanel' && 'xl:grid-cols-[minmax(0,1fr)_26rem]',
        previewLayout === 'split' && 'xl:grid-cols-2',
      )}
    >
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {detail?.workspace?.repoFullName ?? 'Loading…'}
            </h1>
            <p className="text-sm text-muted-foreground">
              Sandbox {detail?.workspace?.sandboxName ?? 'pending'} · Branch{' '}
              {gitState?.currentBranch ?? detail?.workspace?.branch ?? '–'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void syncRepo()}>
              {busyAction?.includes('/sync') ? 'Syncing…' : 'Sync repo'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refreshGitState()}
            >
              {busyAction === '/git/status' ? 'Refreshing…' : 'Git status'}
            </Button>
            <Button size="sm" onClick={() => void refreshPreview()}>
              {busyAction?.includes('/preview-link')
                ? 'Refreshing…'
                : 'Refresh preview'}
            </Button>
            <span className="border-2 border-border px-2 py-1 font-mono text-[0.7rem] text-muted-foreground uppercase">
              View
            </span>
            <Button
              variant={previewLayout === 'inline' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPreviewLayout('inline')}
            >
              Inline
            </Button>
            <Button
              variant={previewLayout === 'sidepanel' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPreviewLayout('sidepanel')}
            >
              Side panel
            </Button>
            <Button
              variant={previewLayout === 'split' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPreviewLayout('split')}
            >
              Split screen
            </Button>
          </div>
        </div>

        {error ? (
          <p className="border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Separator />

        <Card>
          <CardHeader>
            <CardTitle>Run an agent</CardTitle>
            <CardDescription>
              Connect a Base Sepolia wallet, enter a prompt, and pay the x402
              challenge.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe what the agent should do in this repository."
              rows={5}
            />
            <div className="flex items-center gap-2">
              <div ref={selectorRef} className="relative">
                <button
                  type="button"
                  onClick={() => setAgentSelectorOpen((o) => !o)}
                  className="flex items-center gap-2 border-2 border-foreground bg-background px-3 py-2 font-mono text-sm text-foreground transition-colors hover:bg-foreground hover:text-background"
                >
                  <selectedAgent.icon className="h-4 w-4" />
                  {selectedAgent.label}
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${agentSelectorOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {agentSelectorOpen && (
                  <div className="absolute bottom-full left-0 z-50 mb-1 border-2 border-foreground bg-background shadow-[3px_3px_0_hsl(var(--foreground))]">
                    {AGENTS.map((agent) => (
                      <button
                        key={agent.slug}
                        type="button"
                        onClick={() => {
                          setSelectedAgent(agent)
                          setAgentSelectorOpen(false)
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-2 font-mono text-sm transition-colors hover:bg-foreground hover:text-background ${
                          selectedAgent.slug === agent.slug
                            ? 'bg-foreground text-background'
                            : 'text-foreground'
                        }`}
                      >
                        <agent.icon className="h-4 w-4" />
                        {agent.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button
                disabled={busyAction !== null || !wallet.account}
                onClick={() => void startRun(selectedAgent.slug)}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                Run
              </Button>
            </div>
            {!wallet.account ? (
              <p className="text-xs text-muted-foreground">
                Connect a wallet in the top bar before starting a paid run.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {previewLayout === 'inline' ? previewPanel : null}

        <Card>
          <CardHeader>
            <CardTitle>Git workflow</CardTitle>
            <CardDescription>
              Use Daytona git actions to branch, commit, push, and open a draft
              PR.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {gitState ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{gitState.currentBranch}</Badge>
                  <Badge variant="outline">ahead {gitState.ahead}</Badge>
                  <Badge variant="outline">behind {gitState.behind}</Badge>
                  <Badge
                    variant={
                      gitState.branchPublished ? 'secondary' : 'destructive'
                    }
                  >
                    {gitState.branchPublished ? 'published' : 'local only'}
                  </Badge>
                  <Badge variant={gitState.dirty ? 'destructive' : 'secondary'}>
                    {gitState.dirty ? 'dirty' : 'clean'}
                  </Badge>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-medium">
                      Create or switch branch
                    </p>
                    <div className="flex gap-2">
                      <Input
                        value={branchName}
                        onChange={(event) => setBranchName(event.target.value)}
                        placeholder="feature/agent-polish"
                      />
                      <Button
                        variant="outline"
                        onClick={() => void createBranch()}
                        disabled={busyAction !== null}
                      >
                        {busyAction?.includes('/git/branch')
                          ? 'Working…'
                          : 'Checkout branch'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      BuddyPie prefixes new branches with <code>codex/</code>{' '}
                      automatically.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {gitState.branches.map((branch) => (
                        <Badge key={branch} variant="outline">
                          {branch}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-medium">Recent git metadata</p>
                    <div className="flex flex-col gap-2 border-2 border-border p-3 text-sm">
                      <p>
                        Last commit:{' '}
                        {detail?.workspace?.lastCommitSha ? (
                          <code>
                            {detail.workspace.lastCommitSha.slice(0, 12)}
                          </code>
                        ) : (
                          <span className="text-muted-foreground">
                            none yet
                          </span>
                        )}
                      </p>
                      <p>
                        Pull request:{' '}
                        {detail?.workspace?.lastPullRequestUrl ? (
                          <a
                            href={detail.workspace.lastPullRequestUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            Open draft PR
                          </a>
                        ) : (
                          <span className="text-muted-foreground">
                            none yet
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-medium">Changed files</p>
                    <div className="flex max-h-72 flex-col gap-2 overflow-auto border-2 border-border p-3">
                      {gitState.fileStatus.map((file) => (
                        <label
                          key={file.name}
                          className="flex items-start gap-3 border-2 border-border px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={selectedFiles[file.name] ?? false}
                            onChange={(event) => {
                              setSelectedFiles((current) => ({
                                ...current,
                                [file.name]: event.target.checked,
                              }))
                            }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {file.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              staging {file.staging} · worktree {file.worktree}
                              {file.extra ? ` · ${file.extra}` : ''}
                            </span>
                          </span>
                        </label>
                      ))}
                      {gitState.fileStatus.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No uncommitted changes.
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <p className="text-sm font-medium">
                        Commit selected files
                      </p>
                      <Textarea
                        value={commitMessage}
                        onChange={(event) =>
                          setCommitMessage(event.target.value)
                        }
                        placeholder="feat: describe the sandbox changes"
                        rows={3}
                      />
                      <Button
                        onClick={() => void commitChanges()}
                        disabled={
                          busyAction !== null || selectedFileNames.length === 0
                        }
                      >
                        {busyAction?.includes('/git/commit')
                          ? 'Committing…'
                          : `Commit ${selectedFileNames.length || ''}`.trim()}
                      </Button>
                    </div>

                    <Separator />

                    <div className="flex flex-col gap-2">
                      <p className="text-sm font-medium">Push and create PR</p>
                      <Button
                        variant="outline"
                        onClick={() => void pushChanges()}
                        disabled={busyAction !== null}
                      >
                        {busyAction?.includes('/git/push')
                          ? 'Pushing…'
                          : 'Push current branch'}
                      </Button>
                      <Input
                        value={prTitle}
                        onChange={(event) => setPrTitle(event.target.value)}
                        placeholder="Draft PR title"
                      />
                      <Textarea
                        value={prBody}
                        onChange={(event) => setPrBody(event.target.value)}
                        placeholder={`Draft PR body against ${defaultBranch}`}
                        rows={4}
                      />
                      <Button
                        variant="secondary"
                        onClick={() => void createPullRequest()}
                        disabled={busyAction !== null}
                      >
                        {busyAction?.includes('/git/pull-request')
                          ? 'Creating draft PR…'
                          : 'Create draft PR'}
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Git status will appear once the workspace sandbox is ready.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Active session</CardTitle>
                  <CardDescription>
                    Follow-up messages are included in the same paid job.
                  </CardDescription>
                </div>
                {activeRun ? (
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <Link
                        to="/runs/$runId"
                        params={{ runId: activeRun._id }}
                      />
                    }
                  >
                    Open run
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {activeRun ? (
                <>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void refreshRunState()}
                    >
                      Refresh
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void abortActiveRun()}
                    >
                      Abort
                    </Button>
                  </div>
                  <div className="flex max-h-72 flex-col gap-2 overflow-auto">
                    {(detail?.runEvents ?? []).map((event: any) => (
                      <div
                        key={event._id}
                        className="flex flex-col gap-1 border-2 border-border p-2"
                      >
                        <Badge variant="secondary" className="w-fit text-xs">
                          {event.type}
                        </Badge>
                        <p className="text-sm text-muted-foreground">
                          {event.content ?? JSON.stringify(event.raw)}
                        </p>
                      </div>
                    ))}
                    {detail?.runEvents?.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No events yet. Refresh after the agent starts streaming.
                      </p>
                    ) : null}
                  </div>
                  <Separator />
                  <Textarea
                    value={followUp}
                    onChange={(event) => setFollowUp(event.target.value)}
                    placeholder="Send a follow-up instruction."
                    rows={3}
                  />
                  <Button onClick={() => void sendMessage()}>
                    Send follow-up
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No active run. Start one above.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Run history</CardTitle>
              <CardDescription>
                Recent paid jobs for this workspace.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                {(detail?.runs ?? []).map((run: any) => (
                  <Link
                    key={run._id}
                    className="flex items-center justify-between border-2 border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
                    to="/runs/$runId"
                    params={{ runId: run._id }}
                  >
                    <div>
                      <p className="font-medium">{run.agentSlug}</p>
                      <p className="text-xs text-muted-foreground">
                        {run.status}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(run.startedAt).toLocaleString()}
                    </span>
                  </Link>
                ))}
                {detail?.runs?.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No runs yet.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {isPreviewInSidebar ? (
        <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          {previewPanel}
        </aside>
      ) : null}
    </div>
  )
}
