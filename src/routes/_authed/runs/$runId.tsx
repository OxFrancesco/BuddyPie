import { Link, createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@clerk/tanstack-react-start'
import { useQuery } from 'convex/react'
import { api as generatedApi } from '../../../../convex/_generated/api'
import { RunStudio } from '~/components/run-studio'
import { Button } from '~/components/ui/button'

const api = generatedApi as any

export const Route = createFileRoute('/_authed/runs/$runId')({
  component: RunDetailPage,
})

function RunDetailPage() {
  const { runId } = Route.useParams()
  const auth = useAuth()
  const runContext = useQuery(api.buddypie.runForServer, {
    runId,
    requesterId: auth.userId ?? undefined,
  })
  const events = useQuery(api.buddypie.runEventsByRun, { runId })

  return (
    <div className="relative left-1/2 w-screen max-w-[1680px] -translate-x-1/2 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {runContext?.workspace?.repoFullName ?? 'Run session'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {runContext?.run?.agentSlug ?? '–'} · {runContext?.run?.status ?? 'loading'}
            </p>
          </div>

          {runContext?.workspace?._id ? (
            <Button
              variant="outline"
              size="sm"
              render={
                <Link
                  to="/workspaces/$workspaceId"
                  params={{ workspaceId: runContext.workspace._id }}
                />
              }
            >
              Back to workspace
            </Button>
          ) : null}
        </div>

        <RunStudio
          workspaceId={runContext?.workspace?._id ?? ''}
          workspace={runContext?.workspace ?? null}
          run={runContext?.run ?? null}
          events={events ?? []}
          allowNewRun={false}
        />
      </div>
    </div>
  )
}
