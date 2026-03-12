import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@clerk/tanstack-react-start'
import { useQuery } from 'convex/react'
import { api as generatedApi } from '../../../../convex/_generated/api'

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
    <div className="run-page card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Run view</p>
          <h1>{runContext?.workspace?.repoFullName ?? 'Run session'}</h1>
          <p className="muted">
            {runContext?.run?.agentSlug ?? '-'} · {runContext?.run?.status ?? 'loading'}
          </p>
        </div>
      </div>
      <div className="transcript transcript--dense">
        {(events ?? []).map((event: any) => (
          <div key={event._id} className="transcript__event">
            <span className="status-pill">{event.type}</span>
            <p>{event.content ?? JSON.stringify(event.raw)}</p>
          </div>
        ))}
        {events?.length === 0 ? <p className="muted">No run events captured yet.</p> : null}
      </div>
    </div>
  )
}
