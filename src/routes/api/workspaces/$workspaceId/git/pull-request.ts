import { createFileRoute } from '@tanstack/react-router'
import type { Id } from '../../../../../../convex/_generated/dataModel'
import { getGithubOauthToken, requireViewerAuth } from '~/lib/auth'
import { createWorkspacePullRequest } from '~/lib/buddypie-service'
import { errorJson, json, readJsonBody, toErrorMessage } from '~/lib/http'
import { workspaceGitPullRequestSchema } from '~/lib/schemas'

export const Route = createFileRoute('/api/workspaces/$workspaceId/git/pull-request')({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          const { userId } = await requireViewerAuth()
          const body = workspaceGitPullRequestSchema.parse(await readJsonBody(request))
          const token = await getGithubOauthToken(userId)
          const payload = await createWorkspacePullRequest({
            workspaceId: params.workspaceId as Id<'workspaces'>,
            requesterId: userId,
            title: body.title,
            body: body.body,
            baseBranch: body.baseBranch,
            draft: body.draft,
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
