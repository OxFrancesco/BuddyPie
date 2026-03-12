import { createFileRoute } from '@tanstack/react-router'
import { getGithubOauthToken, requireViewerAuth } from '~/lib/auth'
import { listGitHubRepos } from '~/lib/github'
import { errorJson, json, toErrorMessage } from '~/lib/http'

export const Route = createFileRoute('/api/github/repos')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { userId } = await requireViewerAuth()
          const token = await getGithubOauthToken(userId)
          const repos = await listGitHubRepos(token.token)
          return json({ repos })
        } catch (error) {
          const message = toErrorMessage(error)
          return errorJson(
            message === 'Unauthorized' ? 401 : 500,
            message,
          )
        }
      },
    },
  },
})
