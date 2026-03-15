import { createFileRoute } from '@tanstack/react-router'
import type { Id } from '../../../../../../convex/_generated/dataModel'
import { getGithubOauthTokenIfAvailable, requireViewerAuth } from '~/lib/auth'
import { getWorkspaceGitStatus } from '~/lib/buddypie-service'
import { errorJson, json, toErrorMessage } from '~/lib/http'

export const Route = createFileRoute('/api/workspaces/$workspaceId/git/status')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { userId } = await requireViewerAuth()
          const githubToken = await getGithubOauthTokenIfAvailable(userId)
          const payload = await getWorkspaceGitStatus({
            workspaceId: params.workspaceId as Id<'workspaces'>,
            requesterId: userId,
            githubAccessToken: githubToken?.token,
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
