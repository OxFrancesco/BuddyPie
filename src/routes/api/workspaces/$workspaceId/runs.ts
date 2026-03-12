import { createFileRoute } from '@tanstack/react-router'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { requireViewerAuth } from '~/lib/auth'
import { startWorkspaceRun } from '~/lib/buddypie-service'
import { errorJson, json, toErrorMessage } from '~/lib/http'
import { workspaceRunSchema } from '~/lib/schemas'
import { withX402Protection, x402ConfigError } from '~/lib/x402'

export const Route = createFileRoute('/api/workspaces/$workspaceId/runs')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          return await withX402Protection(request, async ({ parsedBody, payment }) => {
            const { userId } = await requireViewerAuth()
            const body = workspaceRunSchema.parse(parsedBody ?? {})
            const runContext = await startWorkspaceRun({
              workspaceId: params.workspaceId as Id<'workspaces'>,
              requesterId: userId,
              agentSlug: body.agentSlug,
              prompt: body.prompt,
              paymentReceipt: payment?.paymentPayload,
              payerWallet: body.payerWallet,
            })

            return json({ run: runContext?.run, workspace: runContext?.workspace })
          })
        } catch (error) {
          const message = toErrorMessage(error)
          if (message.includes('BUDDYPIE_X402_PAY_TO')) {
            return x402ConfigError(error)
          }
          return errorJson(message === 'Unauthorized' ? 401 : 500, message)
        }
      },
    },
  },
})
