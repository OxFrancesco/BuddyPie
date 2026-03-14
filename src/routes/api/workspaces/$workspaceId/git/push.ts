import { createFileRoute } from '@tanstack/react-router'
import type { Id } from '../../../../../../convex/_generated/dataModel'
import { getGithubOauthToken, requireViewerAuth } from '~/lib/auth'
import { pushWorkspaceChanges } from '~/lib/buddypie-service'
import { errorJson, json, toErrorMessage } from '~/lib/http'

export const Route = createFileRoute('/api/workspaces/$workspaceId/git/push')({
  server: {
    handlers: {
      POST: async ({ params }) => {
        try {
          const { userId } = await requireViewerAuth()
          const token = await getGithubOauthToken(userId)
          const payload = await pushWorkspaceChanges({
            workspaceId: params.workspaceId as Id<'workspaces'>,
            requesterId: userId,
            githubAccessToken: token.token,
          })

          return json(payload)
        } catch (error) {
          const message = toErrorMessage(error)
          return errorJson(message === 'Unauthorized' ? 401 : 500, message)
        }
      },
    },
  },
})
