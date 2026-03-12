import * as React from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api as generatedApi } from '../../../convex/_generated/api'
import { shortAddress, useWallet } from '~/components/wallet-provider'

const api = generatedApi as any

type RepoSummary = {
  fullName: string
  private: boolean
  defaultBranch: string
  description: string | null
}

export const Route = createFileRoute('/_authed/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const navigate = useNavigate()
  const dashboard = useQuery(api.buddypie.dashboard, {})
  const wallet = useWallet()
  const [repos, setRepos] = React.useState<RepoSummary[]>([])
  const [repoInput, setRepoInput] = React.useState('')
  const [loadingRepos, setLoadingRepos] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false

    const loadRepos = async () => {
      setLoadingRepos(true)
      setError(null)
      try {
        const response = await fetch('/api/github/repos', {
          credentials: 'same-origin',
        })
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load GitHub repos')
        }
        if (!cancelled) {
          setRepos(payload.repos)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load repos')
        }
      } finally {
        if (!cancelled) {
          setLoadingRepos(false)
        }
      }
    }

    void loadRepos()
    return () => {
      cancelled = true
    }
  }, [])

  const submitImport = async (repo: string) => {
    setImporting(true)
    setError(null)
    try {
      const response = await fetch('/api/workspaces/import', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ repo }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? 'Import failed')
      }
      await navigate({
        to: '/workspaces/$workspaceId',
        params: { workspaceId: payload.workspace._id },
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="dashboard-page">
      <section className="page-hero card">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Import a repository and boot a paid agent run.</h1>
          <p className="muted">
            Auth comes from Clerk GitHub OAuth. Wallet payment uses x402 on Base Sepolia.
          </p>
        </div>
        <div className="hero-meta">
          <div className="meta-chip">
            Wallet: {wallet.account ? shortAddress(wallet.account) : 'not connected'}
          </div>
          <div className="meta-chip">
            Active profiles: {dashboard?.agentProfiles?.length ?? 0}
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Import GitHub repo</h2>
              <p className="muted">Paste a repo URL or select one from your GitHub account.</p>
            </div>
          </div>
          <div className="repo-import-form">
            <input
              className="input"
              placeholder="github.com/owner/repo or owner/repo"
              value={repoInput}
              onChange={(event) => setRepoInput(event.target.value)}
            />
            <button
              className="button button-primary"
              type="button"
              disabled={importing || repoInput.trim().length === 0}
              onClick={() => void submitImport(repoInput)}
            >
              {importing ? 'Importing...' : 'Import repo'}
            </button>
          </div>
          {error ? <p className="error-banner">{error}</p> : null}
          <div className="repo-list">
            <div className="section-heading">
              <h3>GitHub repos</h3>
              <button
                className="button button-muted"
                type="button"
                onClick={() => {
                  setRepos([])
                  setRepoInput('')
                  setError(null)
                }}
              >
                Clear
              </button>
            </div>
            {loadingRepos ? <p className="muted">Loading GitHub repositories...</p> : null}
            {repos.slice(0, 12).map((repo) => (
              <button
                key={repo.fullName}
                className="repo-row"
                type="button"
                onClick={() => {
                  setRepoInput(repo.fullName)
                  void submitImport(repo.fullName)
                }}
              >
                <div>
                  <strong>{repo.fullName}</strong>
                  <p className="muted">{repo.description ?? 'No description provided.'}</p>
                </div>
                <span className={`status-pill ${repo.private ? 'status-pill--warn' : ''}`}>
                  {repo.private ? 'private' : 'public'}
                </span>
              </button>
            ))}
          </div>
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>Platform agents</h2>
              <p className="muted">Two platform-owned agent profiles for the MVP.</p>
            </div>
          </div>
          <div className="agent-cards">
            {(dashboard?.agentProfiles ?? []).map((profile: any) => (
              <article key={profile.slug} className="agent-card">
                <div className={`accent-bar accent-bar--${profile.accent}`} />
                <div>
                  <h3>{profile.name}</h3>
                  <p className="muted">{profile.description}</p>
                </div>
                <div className="agent-card__footer">
                  <span className="status-pill">{profile.priceLabel}</span>
                  <span className="muted">{profile.chain}</span>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Your workspaces</h2>
            <p className="muted">Persistent sandboxes with repo state, previews, and run history.</p>
          </div>
        </div>
        <div className="workspace-grid">
          {(dashboard?.workspaces ?? []).map((workspace: any) => (
            <Link
              key={workspace._id}
              className="workspace-card"
              to="/workspaces/$workspaceId"
              params={{ workspaceId: workspace._id }}
            >
              <div className="section-heading">
                <strong>{workspace.repoFullName}</strong>
                <span className={`status-pill ${workspace.status !== 'ready' ? 'status-pill--warn' : ''}`}>
                  {workspace.status}
                </span>
              </div>
              <p className="muted">Sandbox {workspace.sandboxName ?? 'pending'}</p>
              <p className="muted">Branch {workspace.branch}</p>
              <p className="workspace-meta">
                {workspace.latestRun
                  ? `${workspace.latestRun.agentSlug} · ${workspace.latestRun.status}`
                  : 'No runs yet'}
              </p>
            </Link>
          ))}
          {dashboard?.workspaces?.length === 0 ? (
            <p className="muted">No workspaces yet. Import a GitHub repository to create one.</p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
