import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api as generatedApi } from '../../../../convex/_generated/api'
import { RunStudio } from '~/components/run-studio'
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
  const detail = useQuery(api.buddypie.workspaceDetail, { workspaceId })
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

  const doJsonAction = async (url: string, init?: RequestInit) => {
    setBusyAction(url)
    setError(null)

    try {
      const response = await fetch(url, {
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
      const response = await fetch(`/api/workspaces/${workspaceId}/git/status`, {
        credentials: 'same-origin',
      })
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

      const response = await fetch(`/api/workspaces/${workspaceId}/git/status`, {
        credentials: 'same-origin',
      })
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

  const syncRepo = async () => {
    const payload = await doJsonAction(`/api/workspaces/${workspaceId}/sync`, {
      method: 'POST',
    })
    if (payload) {
      await refreshGitState(true)
    }
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

  return (
    <div className="relative left-1/2 w-screen max-w-[1680px] -translate-x-1/2 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {detail?.workspace?.repoFullName ?? 'Loading workspace…'}
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
            {activeRun ? (
              <Button
                size="sm"
                render={<Link to="/runs/$runId" params={{ runId: activeRun._id }} />}
              >
                Open run
              </Button>
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <RunStudio
          workspaceId={workspaceId}
          workspace={detail?.workspace ?? null}
          run={activeRun ?? null}
          events={detail?.runEvents ?? []}
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(22rem,0.82fr)]">
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
                      <p className="text-sm font-medium">Create or switch branch</p>
                      <div className="flex gap-2">
                        <Input
                          value={branchName}
                          onChange={(event) => setBranchName(event.target.value)}
                          placeholder="feature/live-run-studio"
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
                            <code>{detail.workspace.lastCommitSha.slice(0, 12)}</code>
                          ) : (
                            <span className="text-muted-foreground">none yet</span>
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
                            <span className="text-muted-foreground">none yet</span>
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
                        <p className="text-sm font-medium">Commit selected files</p>
                        <Textarea
                          value={commitMessage}
                          onChange={(event) => setCommitMessage(event.target.value)}
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
                      <p className="text-xs text-muted-foreground">{run.status}</p>
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
    </div>
  )
}
