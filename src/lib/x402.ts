import type {
  HTTPAdapter,
  HTTPRequestContext,
  HTTPResponseInstructions,
  RoutesConfig,
} from '@x402/core/http'
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server'
import { x402HTTPResourceServer } from '@x402/core/http'
import { ExactEvmScheme } from '@x402/evm/exact/server'
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
    payment:
      | null
      | {
          paymentPayload: any
          paymentRequirements: any
          declaredExtensions?: Record<string, unknown>
        }
  }) => Promise<Response>,
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

  const response = await handler({
    parsedBody,
    payment:
      gate.type === 'payment-verified'
        ? {
            paymentPayload: gate.paymentPayload,
            paymentRequirements: gate.paymentRequirements,
            declaredExtensions: gate.declaredExtensions,
          }
        : null,
  })

  if (gate.type !== 'payment-verified' || !response.ok) {
    return response
  }

  const responseHeaders = new Headers(response.headers)
  const responseBytes = await response.arrayBuffer()

  const settlement = await httpServer.processSettlement(
    gate.paymentPayload,
    gate.paymentRequirements,
    gate.declaredExtensions,
    {
      request: context,
      responseBody: Buffer.from(responseBytes),
    },
  )

  if (!settlement.success) {
    return instructionsToResponse(settlement.response)
  }

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
