import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api as generatedApi } from '../../../../convex/_generated/api'
import { useWallet } from '~/components/wallet-provider'

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
    <div className="workspace-page">
      <section className="page-hero card">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>{detail?.workspace?.repoFullName ?? 'Loading workspace...'}</h1>
          <p className="muted">
            Sandbox {detail?.workspace?.sandboxName ?? 'pending'} · Branch {detail?.workspace?.branch ?? '-'}
          </p>
        </div>
        <div className="hero-actions">
          <button className="button button-muted" type="button" onClick={() => void syncRepo()}>
            {busyAction?.includes('/sync') ? 'Syncing...' : 'Sync repo'}
          </button>
          <button className="button button-secondary" type="button" onClick={() => void refreshPreview()}>
            {busyAction?.includes('/preview-link') ? 'Refreshing...' : 'Preview link'}
          </button>
        </div>
      </section>

      {error ? <p className="error-banner">{error}</p> : null}

      <section className="workspace-grid-two">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Run an agent</h2>
              <p className="muted">
                Connect a Base Sepolia wallet, enter a prompt, and pay the x402 challenge automatically.
              </p>
            </div>
          </div>
          <textarea
            className="input input-textarea"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Explain what you want the frontend or docs agent to do in this repository."
          />
          <div className="button-row">
            <button
              className="button button-primary"
              type="button"
              disabled={busyAction !== null || !wallet.account}
              onClick={() => void startRun('frontend')}
            >
              Start frontend agent
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={busyAction !== null || !wallet.account}
              onClick={() => void startRun('docs')}
            >
              Start docs agent
            </button>
          </div>
          {!wallet.account ? (
            <p className="muted">Connect a wallet in the top bar before starting a paid run.</p>
          ) : null}
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Preview</h2>
              <p className="muted">
                If the frontend agent detects a dev server port, BuddyPie can generate a signed Daytona preview URL.
              </p>
            </div>
          </div>
          {previewUrl ? (
            <div className="preview-frame">
              <iframe src={previewUrl} title="BuddyPie preview" />
            </div>
          ) : (
            <p className="muted">No preview URL generated yet.</p>
          )}
        </article>
      </section>

      <section className="workspace-grid-two">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Active session</h2>
              <p className="muted">
                One active run per workspace. Follow-up messages are included in the same paid job.
              </p>
            </div>
            {activeRun ? (
              <Link
                className="button button-muted"
                to="/runs/$runId"
                params={{ runId: activeRun._id }}
              >
                Open run view
              </Link>
            ) : null}
          </div>
          {activeRun ? (
            <>
              <div className="button-row">
                <button className="button button-muted" type="button" onClick={() => void refreshRunState()}>
                  Refresh session
                </button>
                <button className="button button-danger" type="button" onClick={() => void abortActiveRun()}>
                  Abort run
                </button>
              </div>
              <div className="transcript">
                {(detail?.runEvents ?? []).map((event: any) => (
                  <div key={event._id} className="transcript__event">
                    <span className="status-pill">{event.type}</span>
                    <p>{event.content ?? JSON.stringify(event.raw)}</p>
                  </div>
                ))}
                {detail?.runEvents?.length === 0 ? (
                  <p className="muted">No captured run events yet. Refresh the session after the agent starts streaming.</p>
                ) : null}
              </div>
              <textarea
                className="input input-textarea"
                value={followUp}
                onChange={(event) => setFollowUp(event.target.value)}
                placeholder="Send a follow-up instruction to the active run."
              />
              <button className="button button-primary" type="button" onClick={() => void sendMessage()}>
                Send follow-up
              </button>
            </>
          ) : (
            <p className="muted">No active run. Start one above.</p>
          )}
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Run history</h2>
              <p className="muted">Recent paid jobs for this workspace.</p>
            </div>
          </div>
          <div className="history-list">
            {(detail?.runs ?? []).map((run: any) => (
              <Link
                key={run._id}
                className="history-row"
                to="/runs/$runId"
                params={{ runId: run._id }}
              >
                <div>
                  <strong>{run.agentSlug}</strong>
                  <p className="muted">{run.status}</p>
                </div>
                <span className="muted">{new Date(run.startedAt).toLocaleString()}</span>
              </Link>
            ))}
            {detail?.runs?.length === 0 ? <p className="muted">No runs yet.</p> : null}
          </div>
        </article>
      </section>
    </div>
  )
}
