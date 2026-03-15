import { createFileRoute } from '@tanstack/react-router'
import type { Id } from '../../../../convex/_generated/dataModel'
import { parseAgentSlugOrThrow } from '~/lib/agents'
import { PLATFORM_OWNER_ID } from '~/lib/buddypie-config'
import {
  abortRun,
  cancelPreparedWorkspaceRun,
  preparePublicWorkspaceRunStart,
  refreshRun,
  startPreparedWorkspaceRun,
} from '~/lib/buddypie-service'
import { errorJson, json, readJsonBody, toErrorMessage } from '~/lib/http'
import { withX402Protection, x402ConfigError } from '~/lib/x402'

function extractA2AMessageText(params: any) {
  const parts = Array.isArray(params?.message?.parts) ? params.message.parts : []
  return parts
    .filter((part: any) => part?.type === 'text' && typeof part?.text === 'string')
    .map((part: any) => part.text)
    .join('\n')
}

export const Route = createFileRoute('/agents/$slug/a2a')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const body = await readJsonBody<any>(request)
          if (body?.jsonrpc !== '2.0') {
            return json({
              jsonrpc: '2.0',
              id: body?.id ?? null,
              error: { code: -32600, message: 'Invalid Request' },
            })
          }

          const slug = parseAgentSlugOrThrow(params.slug)

          if (body.method === 'tasks/get') {
            const task = await refreshRun({
              runId: body.params?.taskId as Id<'runs'>,
              requesterId: PLATFORM_OWNER_ID,
            })
            return json({
              jsonrpc: '2.0',
              id: body.id ?? null,
              result: {
                id: String(task?.run?._id ?? ''),
                contextId: String(task?.workspace?._id ?? ''),
                status: task?.run?.status ?? 'unknown',
              },
            })
          }

          if (body.method === 'tasks/cancel') {
            const task = await abortRun({
              runId: body.params?.taskId as Id<'runs'>,
              requesterId: PLATFORM_OWNER_ID,
            })
            return json({
              jsonrpc: '2.0',
              id: body.id ?? null,
              result: task,
            })
          }

          if (body.method !== 'message/send') {
            return json({
              jsonrpc: '2.0',
              id: body.id ?? null,
              error: { code: -32601, message: 'Method not found' },
            })
          }

          return await withX402Protection(request, async ({ payment }) => {
            const repo =
              body.params?.repo ??
              body.params?.configuration?.repo ??
              body.params?.metadata?.repo
            const prompt = extractA2AMessageText(body.params)
            const prepared = await preparePublicWorkspaceRunStart({
              agentSlug: slug,
              repoInput: repo,
              prompt,
              paymentReceipt: payment?.paymentPayload,
              payerWallet: payment?.payerWallet,
            })

            return {
              response: json({
                jsonrpc: '2.0',
                id: body.id ?? null,
                result: {
                  id: String(prepared.runContext?.run?._id ?? ''),
                  contextId: String(prepared.runContext?.workspace?._id ?? ''),
                  status: prepared.runContext?.run?.status ?? 'working',
                  messages: [
                    {
                      role: 'agent',
                      parts: [
                        {
                          type: 'text',
                          text: `BuddyPie ${slug} run started for ${prepared.runContext?.workspace?.repoFullName ?? repo}.`,
                        },
                      ],
                    },
                  ],
                  artifacts: [],
                },
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

                return json({
                  jsonrpc: '2.0',
                  id: body.id ?? null,
                  result: {
                    id: String(runContext?.run?._id ?? ''),
                    contextId: String(runContext?.workspace?._id ?? ''),
                    status: runContext?.run?.status ?? 'working',
                    messages: [
                      {
                        role: 'agent',
                        parts: [
                          {
                            type: 'text',
                            text: `BuddyPie ${slug} run started for ${runContext?.workspace?.repoFullName ?? repo}.`,
                          },
                        ],
                      },
                    ],
                    artifacts: [],
                  },
                })
              },
            }
          })
        } catch (error) {
          const message = toErrorMessage(error)
          if (message.includes('BUDDYPIE_X402_PAY_TO')) {
            return x402ConfigError(error)
          }
          return errorJson(500, message)
        }
      },
    },
  },
})
