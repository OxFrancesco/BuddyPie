import { createFileRoute } from '@tanstack/react-router'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { getGithubOauthTokenIfAvailable, requireViewerAuth } from '~/lib/auth'
import {
  cancelPreparedWorkspaceRun,
  prepareWorkspaceRunStart,
  startPreparedWorkspaceRun,
} from '~/lib/buddypie-service'
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
            const githubToken = await getGithubOauthTokenIfAvailable(userId)
            const body = workspaceRunSchema.parse(parsedBody ?? {})
            const prepared = await prepareWorkspaceRunStart({
              workspaceId: params.workspaceId as Id<'workspaces'>,
              requesterId: userId,
              agentSlug: body.agentSlug,
              prompt: body.prompt,
              paymentReceipt: payment?.paymentPayload,
              payerWallet: payment?.payerWallet,
              githubAccessToken: githubToken?.token,
            })

            return {
              response: json({
                run: prepared.runContext?.run,
                workspace: prepared.runContext?.workspace,
              }),
              settle: prepared.created,
              onSettlementFailed: async () => {
                await cancelPreparedWorkspaceRun({ prepared })
              },
              afterSettlement: async ({ payment: settledPayment, settlement }) => {
                const runContext = await startPreparedWorkspaceRun({
                  prepared,
                  paymentReceipt: settledPayment.paymentPayload,
                  payerWallet: settlement.payer ?? settledPayment.payerWallet,
                  settlement,
                })

                return json({ run: runContext?.run, workspace: runContext?.workspace })
              },
            }
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
