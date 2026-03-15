import type {
  HTTPAdapter,
  HTTPRequestContext,
  HTTPResponseInstructions,
  RoutesConfig,
} from '@x402/core/http'
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server'
import { x402HTTPResourceServer } from '@x402/core/http'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { getAddress } from 'viem'
import {
  BASE_SEPOLIA_CAIP2,
  PLATFORM_AGENT_PROFILES,
  isAgentSlug,
} from './buddypie-config'
import { getServerEnv, requireX402PayToAddress } from './server-env'
import { errorJson, readMaybeJsonBody } from './http'

class RequestAdapter implements HTTPAdapter {
  constructor(
    private readonly request: Request,
    private readonly body: unknown,
  ) {}

  getHeader(name: string) {
    return this.request.headers.get(name) ?? undefined
  }

  getMethod() {
    return this.request.method
  }

  getPath() {
    return new URL(this.request.url).pathname
  }

  getUrl() {
    return this.request.url
  }

  getAcceptHeader() {
    return this.request.headers.get('accept') ?? '*/*'
  }

  getUserAgent() {
    return this.request.headers.get('user-agent') ?? ''
  }

  getBody() {
    return this.body
  }
}

type VerifiedPayment = {
  paymentPayload: any
  paymentRequirements: any
  declaredExtensions?: Record<string, unknown>
  payerWallet?: string
}

type ProtectedHandlerResult =
  | Response
  | {
      response: Response
      settle?: boolean
      afterSettlement?: (context: {
        payment: VerifiedPayment
        settlement: any
      }) => Promise<Response | void>
      onSettlementFailed?: (context: {
        payment: VerifiedPayment
        settlement: any
      }) => Promise<void>
    }

function normalizeProtectedHandlerResult(result: ProtectedHandlerResult) {
  if (result instanceof Response) {
    return {
      response: result,
      settle: true,
      afterSettlement: undefined,
      onSettlementFailed: undefined,
    }
  }

  return {
    response: result.response,
    settle: result.settle ?? true,
    afterSettlement: result.afterSettlement,
    onSettlementFailed: result.onSettlementFailed,
  }
}

function readNestedString(
  value: unknown,
  path: readonly string[],
): string | undefined {
  let current: unknown = value

  for (const segment of path) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return undefined
    }
    current = (current as Record<string, unknown>)[segment]
  }

  return typeof current === 'string' ? current : undefined
}

function normalizeWalletAddress(value?: string) {
  if (!value) {
    return undefined
  }

  try {
    return getAddress(value)
  } catch {
    return value
  }
}

export function extractX402PayerWallet(paymentPayload: unknown) {
  return normalizeWalletAddress(
    readNestedString(paymentPayload, ['payload', 'authorization', 'from']) ??
      readNestedString(paymentPayload, ['payload', 'permit2Authorization', 'from']) ??
      readNestedString(paymentPayload, ['payload', 'from']),
  )
}

function agentSlugFromRequest(context: HTTPRequestContext) {
  const pathname = context.path
  const body = context.adapter.getBody?.()
  const fromBody =
    typeof body === 'object' &&
    body &&
    'agentSlug' in body &&
    typeof (body as Record<string, unknown>).agentSlug === 'string'
      ? ((body as Record<string, unknown>).agentSlug as string)
      : null

  if (fromBody && isAgentSlug(fromBody)) {
    return fromBody
  }

  const pathSegments = pathname.split('/').filter(Boolean)
  const slug = pathSegments.find((segment) => isAgentSlug(segment))
  return slug && isAgentSlug(slug) ? slug : 'docs'
}

function priceLabelForRequest(context: HTTPRequestContext) {
  const slug = agentSlugFromRequest(context)
  return PLATFORM_AGENT_PROFILES.find((profile) => profile.slug === slug)?.priceLabel ?? '$0.18'
}

let httpServerPromise: Promise<x402HTTPResourceServer> | null = null

async function buildHttpServer() {
  const env = getServerEnv()
  const facilitator = new HTTPFacilitatorClient({
    url: env.x402FacilitatorUrl,
  })

  const resourceServer = new x402ResourceServer(facilitator).register(
    BASE_SEPOLIA_CAIP2,
    new ExactEvmScheme(),
  )

  const routes: RoutesConfig = {
    'POST /api/workspaces/*/runs': {
      accepts: {
        scheme: 'exact',
        network: BASE_SEPOLIA_CAIP2,
        payTo: requireX402PayToAddress(),
        price: priceLabelForRequest,
      },
      description: 'Start a paid BuddyPie agent run',
      mimeType: 'application/json',
      unpaidResponseBody: (context: HTTPRequestContext) => ({
        contentType: 'application/json',
        body: {
          reason: 'x402 payment required before starting a BuddyPie run',
          agentSlug: agentSlugFromRequest(context),
        },
      }),
      settlementFailedResponseBody: async (
        _context: HTTPRequestContext,
        failure: {
          errorReason?: string
          errorMessage?: string
          payer?: string
          transaction?: string
        },
      ) => ({
        contentType: 'application/json',
        body: {
          error:
            failure.errorMessage ??
            failure.errorReason ??
            'x402 settlement failed while charging the wallet.',
          details: failure.errorReason ?? failure.errorMessage ?? null,
          payer: failure.payer ?? null,
          transaction: failure.transaction ?? null,
        },
      }),
    },
    'POST /agents/*/a2a': {
      accepts: {
        scheme: 'exact',
        network: BASE_SEPOLIA_CAIP2,
        payTo: requireX402PayToAddress(),
        price: priceLabelForRequest,
      },
      description: 'Paid public A2A execution for public GitHub repositories',
      mimeType: 'application/json',
      settlementFailedResponseBody: async (
        _context: HTTPRequestContext,
        failure: {
          errorReason?: string
          errorMessage?: string
          payer?: string
          transaction?: string
        },
      ) => ({
        contentType: 'application/json',
        body: {
          error:
            failure.errorMessage ??
            failure.errorReason ??
            'x402 settlement failed while charging the wallet.',
          details: failure.errorReason ?? failure.errorMessage ?? null,
          payer: failure.payer ?? null,
          transaction: failure.transaction ?? null,
        },
      }),
    },
    'POST /agents/*/mcp': {
      accepts: {
        scheme: 'exact',
        network: BASE_SEPOLIA_CAIP2,
        payTo: requireX402PayToAddress(),
        price: priceLabelForRequest,
      },
      description: 'Paid public MCP execution for public GitHub repositories',
      mimeType: 'application/json',
      settlementFailedResponseBody: async (
        _context: HTTPRequestContext,
        failure: {
          errorReason?: string
          errorMessage?: string
          payer?: string
          transaction?: string
        },
      ) => ({
        contentType: 'application/json',
        body: {
          error:
            failure.errorMessage ??
            failure.errorReason ??
            'x402 settlement failed while charging the wallet.',
          details: failure.errorReason ?? failure.errorMessage ?? null,
          payer: failure.payer ?? null,
          transaction: failure.transaction ?? null,
        },
      }),
    },
  }

  const server = new x402HTTPResourceServer(resourceServer, routes)
  server.onProtectedRequest(async (context: HTTPRequestContext) => {
    const body = context.adapter.getBody?.()
    const method =
      typeof body === 'object' &&
      body &&
      'method' in body &&
      typeof (body as Record<string, unknown>).method === 'string'
        ? ((body as Record<string, unknown>).method as string)
        : null

    if (context.path.endsWith('/mcp') && method && ['initialize', 'tools/list'].includes(method)) {
      return { grantAccess: true }
    }

    if (context.path.endsWith('/a2a') && method && ['tasks/get', 'tasks/cancel'].includes(method)) {
      return { grantAccess: true }
    }

    return undefined
  })
  await server.initialize()
  return server
}

export async function getX402HttpServer() {
  if (!httpServerPromise) {
    httpServerPromise = buildHttpServer()
  }

  return httpServerPromise
}

function instructionsToResponse(instructions: HTTPResponseInstructions) {
  const headers = new Headers(instructions.headers)
  const body =
    typeof instructions.body === 'string'
      ? instructions.body
      : instructions.body === undefined
        ? null
        : JSON.stringify(instructions.body)

  return new Response(body, {
    status: instructions.status,
    headers,
  })
}

export async function withX402Protection(
  request: Request,
  handler: (context: {
    parsedBody: unknown
    payment: VerifiedPayment | null
  }) => Promise<ProtectedHandlerResult>,
) {
  let parsedBody: unknown = null
  try {
    parsedBody = await readMaybeJsonBody(request.clone())
  } catch {
    parsedBody = null
  }

  const adapter = new RequestAdapter(request, parsedBody)
  const context: HTTPRequestContext = {
    adapter,
    path: adapter.getPath(),
    method: adapter.getMethod(),
    paymentHeader:
      adapter.getHeader('PAYMENT-SIGNATURE') ?? adapter.getHeader('X-PAYMENT'),
  }

  const httpServer = await getX402HttpServer()
  const gate = await httpServer.processHTTPRequest(context, {
    appName: 'BuddyPie',
    testnet: true,
    currentUrl: request.url,
  })

  if (gate.type === 'payment-error') {
    return instructionsToResponse(gate.response)
  }

  const payment =
    gate.type === 'payment-verified'
      ? {
          paymentPayload: gate.paymentPayload,
          paymentRequirements: gate.paymentRequirements,
          declaredExtensions: gate.declaredExtensions,
          payerWallet: extractX402PayerWallet(gate.paymentPayload),
        }
      : null

  const handlerResult = normalizeProtectedHandlerResult(
    await handler({
      parsedBody,
      payment,
    }),
  )

  if (
    gate.type !== 'payment-verified' ||
    !handlerResult.response.ok ||
    !handlerResult.settle
  ) {
    return handlerResult.response
  }

  if (!payment) {
    return handlerResult.response
  }

  const settlement = await httpServer.processSettlement(
    gate.paymentPayload,
    gate.paymentRequirements,
    gate.declaredExtensions,
    {
      request: context,
    },
  )

  if (!settlement.success) {
    await handlerResult.onSettlementFailed?.({
      payment,
      settlement,
    })

    return instructionsToResponse(settlement.response)
  }

  let response = handlerResult.response
  if (handlerResult.afterSettlement) {
    try {
      const settledResponse = await handlerResult.afterSettlement({
        payment,
        settlement,
      })
      if (settledResponse) {
        response = settledResponse
      }
    } catch (error) {
      response = errorJson(
        500,
        'x402 payment settled, but BuddyPie failed while starting the run.',
        {
          details: error instanceof Error ? error.message : String(error),
        },
      )
    }
  }

  const responseHeaders = new Headers(response.headers)
  const responseBytes = await response.arrayBuffer()

  for (const [name, value] of Object.entries(settlement.headers)) {
    responseHeaders.set(name, value)
  }

  return new Response(responseBytes, {
    status: response.status,
    headers: responseHeaders,
  })
}

function formatX402ConfigMessage(details: string) {
  if (details.includes('BUDDYPIE_X402_PAY_TO')) {
    return 'x402 configuration error: set BUDDYPIE_X402_PAY_TO to the Base Sepolia address that should receive BuddyPie payments.'
  }

  if (details.includes('X402_FACILITATOR_URL')) {
    return 'x402 configuration error: set X402_FACILITATOR_URL to a reachable facilitator endpoint, such as https://x402.org/facilitator.'
  }

  return `x402 configuration error: ${details}`
}

export function x402ConfigError(error: unknown) {
  const details = error instanceof Error ? error.message : String(error)

  return errorJson(500, formatX402ConfigMessage(details), {
    details,
  })
}
