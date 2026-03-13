import * as React from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api as generatedApi } from '../../../convex/_generated/api'
import { shortAddress, useWallet } from '~/components/wallet-provider'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import { Input } from '~/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { Separator } from '~/components/ui/separator'

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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Import a repository and boot a paid agent run.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            Wallet: {wallet.account ? shortAddress(wallet.account) : 'not connected'}
          </Badge>
          <Badge variant="outline" className="font-mono text-xs">
            Profiles: {dashboard?.agentProfiles?.length ?? 0}
          </Badge>
        </div>
      </div>

      <Separator />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Import GitHub repo</CardTitle>
            <CardDescription>
              Paste a repo URL or select one from your GitHub account.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Input
                placeholder="owner/repo"
                value={repoInput}
                onChange={(event) => setRepoInput(event.target.value)}
              />
              <Button
                disabled={importing || repoInput.trim().length === 0}
                onClick={() => void submitImport(repoInput)}
              >
                {importing ? 'Importing…' : 'Import'}
              </Button>
            </div>
            {error ? (
              <p className="border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">GitHub repos</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRepos([])
                  setRepoInput('')
                  setError(null)
                }}
              >
                Clear
              </Button>
            </div>
            {loadingRepos ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : null}
            <div className="flex flex-col gap-1">
              {repos.slice(0, 12).map((repo) => (
                <button
                  key={repo.fullName}
                  type="button"
                  className="flex items-center justify-between gap-2 border-2 border-border px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                  onClick={() => {
                    setRepoInput(repo.fullName)
                    void submitImport(repo.fullName)
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{repo.fullName}</p>
                    <p className="truncate text-muted-foreground">
                      {repo.description ?? 'No description'}
                    </p>
                  </div>
                  <Badge variant={repo.private ? 'destructive' : 'secondary'}>
                    {repo.private ? 'private' : 'public'}
                  </Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platform agents</CardTitle>
            <CardDescription>Agent profiles available for paid runs.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {(dashboard?.agentProfiles ?? []).map((profile: any) => (
                <div
                  key={profile.slug}
                  className="flex flex-col gap-1 border-2 border-border p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{profile.name}</p>
                    <Badge variant="secondary">{profile.priceLabel}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{profile.description}</p>
                  <p className="font-mono text-xs text-muted-foreground">{profile.chain}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your workspaces</CardTitle>
          <CardDescription>
            Persistent sandboxes with repo state, previews, and run history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(dashboard?.workspaces ?? []).map((workspace: any) => (
              <Link
                key={workspace._id}
                className="flex flex-col gap-2 border-2 border-border p-3 transition-colors hover:bg-muted"
                to="/workspaces/$workspaceId"
                params={{ workspaceId: workspace._id }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{workspace.repoFullName}</p>
                  <Badge
                    variant={workspace.status === 'ready' ? 'secondary' : 'destructive'}
                  >
                    {workspace.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {workspace.sandboxName ?? 'pending'} · {workspace.branch}
                </p>
                <p className="text-xs text-muted-foreground">
                  {workspace.latestRun
                    ? `${workspace.latestRun.agentSlug} · ${workspace.latestRun.status}`
                    : 'No runs yet'}
                </p>
              </Link>
            ))}
            {dashboard?.workspaces?.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No workspaces yet. Import a GitHub repository to create one.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
