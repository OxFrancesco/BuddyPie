import { createFileRoute } from '@tanstack/react-router'
import { buildOasfDescriptor, parseAgentSlugOrThrow } from '~/lib/agents'
import { json } from '~/lib/http'

export const Route = createFileRoute('/agents/$slug/oasf.json')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slug = parseAgentSlugOrThrow(params.slug)
        return json(buildOasfDescriptor(slug))
      },
    },
  },
})
