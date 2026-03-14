import { ConvexHttpClient } from 'convex/browser'
import { SDK } from 'agent0-sdk'
import { api } from '../convex/_generated/api'
import { loadProjectEnv } from './_shared/project-env'
import {
  buildAgentCard,
  buildAgentRegistration,
} from '../src/lib/agents'
import {
  BASE_SEPOLIA_CAIP2,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_RPC_URL,
  PLATFORM_AGENT_PROFILES,
  type AgentSlug,
  getAgentProfile,
} from '../src/lib/buddypie-config'

loadProjectEnv()

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '')
}

function getBaseUrl() {
  return normalizeBaseUrl(requireEnv('BUDDYPIE_PUBLIC_URL'))
}

function getConvexUrl() {
  return process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL ?? null
}

function shouldUseIpfs(args: Set<string>) {
  return args.has('--ipfs')
}

function shouldUseOnChainData(args: Set<string>) {
  return args.has('--onchain-data')
}

async function upsertConvexRegistration(options: {
  agentSlug: AgentSlug
  agentId: string
  agentUri: string
  registrationUri: string
  a2aUrl: string
  mcpUrl: string
  txHash: string
  metadata: Record<string, unknown>
}) {
  const convexUrl = getConvexUrl()
  if (!convexUrl) {
    return
  }

  const client = new ConvexHttpClient(convexUrl)
  await client.mutation(api.buddypie.upsertRegistration, {
    agentSlug: options.agentSlug,
    chain: BASE_SEPOLIA_CAIP2,
    network: BASE_SEPOLIA_CAIP2,
    agentId: options.agentId,
    agentUri: options.agentUri,
    registrationUri: options.registrationUri,
    a2aUrl: options.a2aUrl,
    mcpUrl: options.mcpUrl,
    active: true,
    x402Support: true,
    txHash: options.txHash,
    metadata: options.metadata,
  })
}

async function registerAgent(options: {
  sdk: SDK
  baseUrl: string
  slug: AgentSlug
  useIpfs: boolean
  useOnChainData: boolean
}) {
  const profile = getAgentProfile(options.slug)
  const card = buildAgentCard(options.slug, options.baseUrl)
  const registration = buildAgentRegistration(options.slug, options.baseUrl)
  const registrationUri = `${options.baseUrl}/agents/${options.slug}/registration.json`

  const agent = options.sdk.createAgent(
    registration.name,
    registration.description,
    registration.image,
  )

  await agent.setA2A(card.endpoints.card, '0.2.0', false)
  await agent.setMCP(card.endpoints.mcp, '1.0.0', false)
  agent.setTrust(true, true, false)
  agent.setActive(true)
  agent.setX402Support(true)
  agent.setMetadata({
    ...registration.metadata,
    agentSlug: options.slug,
    agentCardUrl: card.endpoints.card,
    a2aUrl: card.endpoints.a2a,
    mcpUrl: card.endpoints.mcp,
    registrationUri,
  })

  for (const domain of profile.oasfDomains) {
    agent.addDomain(domain, false)
  }

  for (const skill of profile.oasfSkills) {
    agent.addSkill(skill, false)
  }

  const handle = options.useIpfs
    ? await agent.registerIPFS()
    : options.useOnChainData
      ? await agent.registerOnChain()
      : await agent.registerHTTP(registrationUri)

  const { result } = await handle.waitConfirmed({
    timeoutMs: 180_000,
  })

  if (!result.agentId || !result.agentURI) {
    throw new Error(`Agent registration for ${options.slug} did not return agentId/agentURI`)
  }

  await upsertConvexRegistration({
    agentSlug: options.slug,
    agentId: result.agentId,
    agentUri: result.agentURI,
    registrationUri,
    a2aUrl: card.endpoints.a2a,
    mcpUrl: card.endpoints.mcp,
    txHash: handle.hash,
    metadata: registration.metadata,
  })

  return {
    slug: options.slug,
    name: registration.name,
    agentId: result.agentId,
    agentUri: result.agentURI,
    registrationUri,
    txHash: handle.hash,
  }
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const dryRun = args.has('--dry-run')
  const useIpfs = shouldUseIpfs(args)
  const useOnChainData = shouldUseOnChainData(args)
  const baseUrl = getBaseUrl()

  if (dryRun) {
    const preview = PLATFORM_AGENT_PROFILES.map((profile) => ({
      slug: profile.slug,
      card: buildAgentCard(profile.slug, baseUrl),
      registration: buildAgentRegistration(profile.slug, baseUrl),
    }))

    console.log(JSON.stringify(preview, null, 2))
    return
  }

  const sdk = new SDK({
    chainId: BASE_SEPOLIA_CHAIN_ID,
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL ?? BASE_SEPOLIA_RPC_URL,
    privateKey: requireEnv('PRIVATE_KEY'),
    ...(useIpfs
      ? {
          ipfs: 'pinata' as const,
          pinataJwt: requireEnv('PINATA_JWT'),
        }
      : {}),
  })

  const results = []
  for (const profile of PLATFORM_AGENT_PROFILES) {
    results.push(
      await registerAgent({
        sdk,
        baseUrl,
        slug: profile.slug,
        useIpfs,
        useOnChainData,
      }),
    )
  }

  console.log(JSON.stringify(results, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
