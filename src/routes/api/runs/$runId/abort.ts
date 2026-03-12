import { createFileRoute } from '@tanstack/react-router'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { requireViewerAuth } from '~/lib/auth'
import { abortRun } from '~/lib/buddypie-service'
import { errorJson, json, toErrorMessage } from '~/lib/http'

export const Route = createFileRoute('/api/runs/$runId/abort')({
  server: {
    handlers: {
      POST: async ({ params }) => {
        try {
          const { userId } = await requireViewerAuth()
          const run = await abortRun({
            runId: params.runId as Id<'runs'>,
            requesterId: userId,
          })

          return json({ run })
        } catch (error) {
          return errorJson(500, toErrorMessage(error))
        }
      },
    },
  },
})
