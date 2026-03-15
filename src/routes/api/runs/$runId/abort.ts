import { createFileRoute } from '@tanstack/react-router'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { getGithubOauthTokenIfAvailable, requireViewerAuth } from '~/lib/auth'
import { abortRun } from '~/lib/buddypie-service'
import { errorJson, json, toErrorMessage } from '~/lib/http'

export const Route = createFileRoute('/api/runs/$runId/abort')({
  server: {
    handlers: {
      POST: async ({ params }) => {
        try {
          const { userId } = await requireViewerAuth()
          const githubToken = await getGithubOauthTokenIfAvailable(userId)
          const run = await abortRun({
            runId: params.runId as Id<'runs'>,
            requesterId: userId,
            githubAccessToken: githubToken?.token,
          })

          return json({ run })
        } catch (error) {
          return errorJson(500, toErrorMessage(error))
        }
      },
    },
  },
})
