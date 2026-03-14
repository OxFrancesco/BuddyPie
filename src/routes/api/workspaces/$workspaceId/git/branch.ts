import { createFileRoute } from '@tanstack/react-router'
import type { Id } from '../../../../../../convex/_generated/dataModel'
import { requireViewerAuth } from '~/lib/auth'
import { createWorkspaceBranch } from '~/lib/buddypie-service'
import { errorJson, json, readJsonBody, toErrorMessage } from '~/lib/http'
import { workspaceGitBranchSchema } from '~/lib/schemas'

export const Route = createFileRoute('/api/workspaces/$workspaceId/git/branch')({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          const { userId } = await requireViewerAuth()
          const body = workspaceGitBranchSchema.parse(await readJsonBody(request))
          const payload = await createWorkspaceBranch({
            workspaceId: params.workspaceId as Id<'workspaces'>,
            requesterId: userId,
            branchName: body.branchName,
            checkout: body.checkout,
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
