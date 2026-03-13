import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api as generatedApi } from '../../../../convex/_generated/api'
import { useWallet } from '~/components/wallet-provider'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import { Textarea } from '~/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { Separator } from '~/components/ui/separator'

const api = generatedApi as any

export const Route = createFileRoute('/_authed/workspaces/$workspaceId')({
  component: WorkspaceDetailPage,
})

function WorkspaceDetailPage() {
  const { workspaceId } = Route.useParams()
  const wallet = useWallet()
  const detail = useQuery(api.buddypie.workspaceDetail, { workspaceId })
  const [prompt, setPrompt] = React.useState('')
  const [followUp, setFollowUp] = React.useState('')
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [busyAction, setBusyAction] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const activeRun = detail?.activeRun ?? null

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
        throw new Error(payload.error ?? 'Request failed')
      }
      return payload
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Request failed')
      return null
    } finally {
      setBusyAction(null)
    }
  }

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
    await doJsonAction(`/api/workspaces/${workspaceId}/sync`, {
      method: 'POST',
    })
  }

  const refreshPreview = async () => {
    const payload = await doJsonAction(`/api/workspaces/${workspaceId}/preview-link`, {
      method: 'POST',
    })
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {detail?.workspace?.repoFullName ?? 'Loading…'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Sandbox {detail?.workspace?.sandboxName ?? 'pending'} · Branch{' '}
            {detail?.workspace?.branch ?? '–'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void syncRepo()}>
            {busyAction?.includes('/sync') ? 'Syncing…' : 'Sync repo'}
          </Button>
          <Button size="sm" onClick={() => void refreshPreview()}>
            {busyAction?.includes('/preview-link') ? 'Refreshing…' : 'Preview link'}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Separator />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Run an agent</CardTitle>
            <CardDescription>
              Connect a Base Sepolia wallet, enter a prompt, and pay the x402 challenge.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe what the agent should do in this repository."
              rows={5}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={busyAction !== null || !wallet.account}
                onClick={() => void startRun('frontend')}
              >
                Frontend agent
              </Button>
              <Button
                variant="secondary"
                disabled={busyAction !== null || !wallet.account}
                onClick={() => void startRun('docs')}
              >
                Docs agent
              </Button>
            </div>
            {!wallet.account ? (
              <p className="text-xs text-muted-foreground">
                Connect a wallet in the top bar before starting a paid run.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>
              Signed Daytona preview URL when a dev server port is detected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {previewUrl ? (
              <div className="overflow-hidden border-2 border-foreground">
                <iframe
                  src={previewUrl}
                  title="BuddyPie preview"
                  className="min-h-80 w-full border-0"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No preview URL generated yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

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
                    <Link to="/runs/$runId" params={{ runId: activeRun._id }} />
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
                  <Button variant="outline" size="sm" onClick={() => void refreshRunState()}>
                    Refresh
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => void abortActiveRun()}>
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
                <Button onClick={() => void sendMessage()}>Send follow-up</Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No active run. Start one above.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Run history</CardTitle>
            <CardDescription>Recent paid jobs for this workspace.</CardDescription>
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
  )
}
