import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@clerk/tanstack-react-start'
import { useQuery } from 'convex/react'
import { api as generatedApi } from '../../../../convex/_generated/api'
import { Badge } from '~/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'

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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {runContext?.workspace?.repoFullName ?? 'Run session'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {runContext?.run?.agentSlug ?? '–'} · {runContext?.run?.status ?? 'loading'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex max-h-[36rem] flex-col gap-2 overflow-auto">
            {(events ?? []).map((event: any) => (
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
            {events?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No run events captured yet.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
