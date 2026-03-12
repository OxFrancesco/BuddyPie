import { createFileRoute } from '@tanstack/react-router'
import { buildAgentRegistration, parseAgentSlugOrThrow } from '~/lib/agents'
import { json } from '~/lib/http'
import { getServerEnv } from '~/lib/server-env'

export const Route = createFileRoute('/agents/$slug/registration.json')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slug = parseAgentSlugOrThrow(params.slug)
        return json(buildAgentRegistration(slug, getServerEnv().publicBaseUrl))
      },
    },
  },
})
