import { createFileRoute } from '@tanstack/react-router'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { requireViewerAuth } from '~/lib/auth'
import { refreshRun } from '~/lib/buddypie-service'
import { errorJson, json, toErrorMessage } from '~/lib/http'

export const Route = createFileRoute('/api/runs/$runId/refresh')({
  server: {
    handlers: {
      POST: async ({ params }) => {
        try {
          const { userId } = await requireViewerAuth()
          const runContext = await refreshRun({
            runId: params.runId as Id<'runs'>,
            requesterId: userId,
          })

          return json({ run: runContext?.run, workspace: runContext?.workspace })
        } catch (error) {
          return errorJson(500, toErrorMessage(error))
        }
      },
    },
  },
})
