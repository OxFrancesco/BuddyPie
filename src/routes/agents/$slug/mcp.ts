import { createFileRoute } from '@tanstack/react-router'
import { parseAgentSlugOrThrow } from '~/lib/agents'
import { ensurePublicWorkspaceRun } from '~/lib/buddypie-service'
import { errorJson, json, readJsonBody, toErrorMessage } from '~/lib/http'
import { withX402Protection, x402ConfigError } from '~/lib/x402'

export const Route = createFileRoute('/agents/$slug/mcp')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const slug = parseAgentSlugOrThrow(params.slug)
          const body = await readJsonBody<any>(request)
          const id = body?.id ?? null

          if (body?.method === 'initialize') {
            return json({
              jsonrpc: '2.0',
              id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: {
                  tools: {},
                },
                serverInfo: {
                  name: `buddypie-${slug}`,
                  version: '0.1.0',
                },
              },
            })
          }

          if (body?.method === 'tools/list') {
            return json({
              jsonrpc: '2.0',
              id,
              result: {
                tools: [
                  {
                    name: 'run_agent',
                    description: `Run the BuddyPie ${slug} agent against a public GitHub repo`,
                    inputSchema: {
                      type: 'object',
                      properties: {
                        repo: { type: 'string' },
                        prompt: { type: 'string' },
                        payerWallet: { type: 'string' },
                      },
                      required: ['repo', 'prompt'],
                    },
                  },
                ],
              },
            })
          }

          if (body?.method !== 'tools/call') {
            return json({
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: 'Method not found' },
            })
          }

          return await withX402Protection(request, async ({ payment }) => {
            const args = body.params?.arguments ?? {}
            const runContext = await ensurePublicWorkspaceRun({
              agentSlug: slug,
              repoInput: args.repo,
              prompt: args.prompt,
              paymentReceipt: payment?.paymentPayload,
              payerWallet: args.payerWallet,
            })

            return json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        runId: String(runContext?.run?._id ?? ''),
                        workspaceId: String(runContext?.workspace?._id ?? ''),
                        repoFullName: runContext?.workspace?.repoFullName,
                        status: runContext?.run?.status,
                      },
                      null,
                      2,
                    ),
                  },
                ],
              },
            })
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
