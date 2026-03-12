import { createFileRoute } from '@tanstack/react-router'
import { buildAgentCard, parseAgentSlugOrThrow } from '~/lib/agents'
import { json } from '~/lib/http'
import { getServerEnv } from '~/lib/server-env'

export const Route = createFileRoute('/agents/$slug/.well-known/agent-card.json')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slug = parseAgentSlugOrThrow(params.slug)
        return json(buildAgentCard(slug, getServerEnv().publicBaseUrl))
      },
    },
  },
})
