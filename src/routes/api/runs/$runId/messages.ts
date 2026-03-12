import { createFileRoute } from '@tanstack/react-router'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { requireViewerAuth } from '~/lib/auth'
import { postRunMessage } from '~/lib/buddypie-service'
import { errorJson, json, readJsonBody, toErrorMessage } from '~/lib/http'
import { runMessageSchema } from '~/lib/schemas'

export const Route = createFileRoute('/api/runs/$runId/messages')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const { userId } = await requireViewerAuth()
          const body = runMessageSchema.parse(await readJsonBody(request))
          const runContext = await postRunMessage({
            runId: params.runId as Id<'runs'>,
            requesterId: userId,
            prompt: body.prompt,
          })

          return json({ run: runContext?.run, workspace: runContext?.workspace })
        } catch (error) {
          return errorJson(500, toErrorMessage(error))
        }
      },
    },
  },
})
