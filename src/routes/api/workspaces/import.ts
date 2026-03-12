import { createFileRoute } from '@tanstack/react-router'
import { requireViewerAuth, getGithubOauthToken } from '~/lib/auth'
import { importWorkspace } from '~/lib/buddypie-service'
import { errorJson, json, readJsonBody, toErrorMessage } from '~/lib/http'
import { workspaceImportSchema } from '~/lib/schemas'

export const Route = createFileRoute('/api/workspaces/import')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { userId } = await requireViewerAuth()
          const body = workspaceImportSchema.parse(await readJsonBody(request))
          const token = await getGithubOauthToken(userId)
          const workspace = await importWorkspace({
            ownerId: userId,
            repoInput: body.repo,
            githubAccessToken: token.token,
          })

          return json({ workspace })
        } catch (error) {
          const message = toErrorMessage(error)
          return errorJson(message === 'Unauthorized' ? 401 : 500, message)
        }
      },
    },
  },
})
