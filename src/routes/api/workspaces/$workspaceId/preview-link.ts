import { createFileRoute } from '@tanstack/react-router'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { requireViewerAuth } from '~/lib/auth'
import { getPreviewLink } from '~/lib/buddypie-service'
import { errorJson, json, toErrorMessage } from '~/lib/http'

export const Route = createFileRoute('/api/workspaces/$workspaceId/preview-link')({
  server: {
    handlers: {
      POST: async ({ params }) => {
        try {
          const { userId } = await requireViewerAuth()
          const preview = await getPreviewLink({
            workspaceId: params.workspaceId as Id<'workspaces'>,
            requesterId: userId,
          })

          return json(preview)
        } catch (error) {
          return errorJson(500, toErrorMessage(error))
        }
      },
    },
  },
})
