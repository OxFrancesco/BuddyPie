import { createFileRoute } from '@tanstack/react-router'
import type { Id } from '../../../../../../convex/_generated/dataModel'
import {
  getGithubOauthTokenIfAvailable,
  getViewerCommitIdentity,
  requireViewerAuth,
} from '~/lib/auth'
import { commitWorkspaceChanges } from '~/lib/buddypie-service'
import { errorJson, json, readJsonBody, toErrorMessage } from '~/lib/http'
import { workspaceGitCommitSchema } from '~/lib/schemas'

export const Route = createFileRoute('/api/workspaces/$workspaceId/git/commit')({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          const { userId } = await requireViewerAuth()
          const githubToken = await getGithubOauthTokenIfAvailable(userId)
          const body = workspaceGitCommitSchema.parse(await readJsonBody(request))
          const author = await getViewerCommitIdentity(userId)
          const payload = await commitWorkspaceChanges({
            workspaceId: params.workspaceId as Id<'workspaces'>,
            requesterId: userId,
            message: body.message,
            files: body.files,
            author,
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
