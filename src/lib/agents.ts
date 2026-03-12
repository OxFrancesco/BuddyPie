import {
  BASE_SEPOLIA_CAIP2,
  PLATFORM_AGENT_PROFILES,
  type AgentSlug,
  getAgentProfile,
  isAgentSlug,
} from './buddypie-config'

export function parseAgentSlugOrThrow(value: string) {
  if (!isAgentSlug(value)) {
    throw new Error(`Unknown BuddyPie agent slug: ${value}`)
  }

  return value
}

export function buildAgentCard(slug: AgentSlug, baseUrl: string) {
  const profile = getAgentProfile(slug)
  const agentBaseUrl = `${baseUrl}/agents/${slug}`

  return {
    name: `BuddyPie ${profile.name}`,
    description: profile.description,
    version: '0.1.0',
    url: agentBaseUrl,
    provider: {
      organization: 'BuddyPie',
      url: baseUrl,
    },
    capabilities: {
      streaming: true,
      previews: slug === 'frontend',
      paid: true,
    },
    defaultInputModes: ['text'],
    defaultOutputModes: ['text', 'json'],
    skills: profile.oasfSkills.map((skillId) => ({
      id: skillId,
      name: skillId.split('/').pop(),
      description: profile.promptHint,
    })),
    endpoints: {
      a2a: `${agentBaseUrl}/a2a`,
      mcp: `${agentBaseUrl}/mcp`,
      card: `${agentBaseUrl}/.well-known/agent-card.json`,
    },
  }
}

export function buildAgentRegistration(slug: AgentSlug, baseUrl: string) {
  const profile = getAgentProfile(slug)
  const agentBaseUrl = `${baseUrl}/agents/${slug}`

  return {
    name: `BuddyPie ${profile.name}`,
    description: profile.description,
    image: `${baseUrl}/favicon-32x32.png`,
    tags: ['buddy pie', 'daytona', 'pi', 'x402', slug],
    active: true,
    x402Support: true,
    registrationType: 'erc8004',
    services: [
      {
        name: 'A2A',
        serviceType: 'a2a',
        endpoint: `${agentBaseUrl}/a2a`,
        version: '0.2.0',
      },
      {
        name: 'MCP',
        serviceType: 'mcp',
        endpoint: `${agentBaseUrl}/mcp`,
        version: '1.0.0',
      },
      {
        name: 'AgentCard',
        serviceType: 'agent-card',
        endpoint: `${agentBaseUrl}/.well-known/agent-card.json`,
        version: '1.0.0',
      },
      {
        name: 'OASF',
        serviceType: 'oasf',
        endpoint: `${agentBaseUrl}/oasf.json`,
        version: '0.8.0',
      },
    ],
    metadata: {
      chain: BASE_SEPOLIA_CAIP2,
      price: profile.priceLabel,
      domains: profile.oasfDomains,
      skills: profile.oasfSkills,
    },
  }
}

export function buildOasfDescriptor(slug: AgentSlug) {
  const profile = getAgentProfile(slug)
  return {
    name: `BuddyPie ${profile.name}`,
    version: '0.1.0',
    domains: profile.oasfDomains,
    skills: profile.oasfSkills,
    pricing: {
      chain: BASE_SEPOLIA_CAIP2,
      model: 'x402',
      amount: profile.priceLabel,
    },
  }
}

export function buildAgentCatalog(baseUrl: string) {
  return PLATFORM_AGENT_PROFILES.map((profile) => ({
    ...buildAgentCard(profile.slug, baseUrl),
  }))
}
