export const PLATFORM_OWNER_ID = 'platform-public'
export const BASE_SEPOLIA_CHAIN_ID = 84532
export const BASE_SEPOLIA_CHAIN_HEX = '0x14A34'
export const BASE_SEPOLIA_CAIP2 = 'eip155:84532'
export const BASE_SEPOLIA_RPC_URL = 'https://sepolia.base.org'
export const BASE_SEPOLIA_EXPLORER_URL = 'https://sepolia.basescan.org'

export const DAYTONA_HOME_DIR = '/home/daytona'
export const DAYTONA_REPOS_DIR = `${DAYTONA_HOME_DIR}/workspaces`
export const BUDDYPIE_REMOTE_DIR = `${DAYTONA_HOME_DIR}/.buddypie`
export const BUDDYPIE_REMOTE_PI_ASSETS_DIR = `${BUDDYPIE_REMOTE_DIR}/pi-assets`
export const BUDDYPIE_REMOTE_PI_SESSIONS_DIR = `${BUDDYPIE_REMOTE_DIR}/sessions`

export type AgentSlug = 'frontend' | 'docs'
export type AgentSkillSetId = string

export type AgentProfile = {
  slug: AgentSlug
  name: string
  description: string
  priceUsd: number
  priceLabel: string
  accent: string
  active: boolean
  x402Enabled: boolean
  chain: string
  oasfDomains: string[]
  oasfSkills: string[]
  skillSet: AgentSkillSetId[]
  promptHint: string
}

export const PLATFORM_AGENT_PROFILES: AgentProfile[] = [
  {
    slug: 'frontend',
    name: 'Frontend Builder',
    description:
      'Optimized for UI work, build fixes, dev servers, and getting a browser preview online quickly.',
    priceUsd: 0.35,
    priceLabel: '$0.35',
    accent: 'sunrise',
    active: true,
    x402Enabled: true,
    chain: BASE_SEPOLIA_CAIP2,
    oasfDomains: ['technology/software_engineering', 'design/user_interfaces'],
    oasfSkills: ['frontend_development', 'developer_documentation'],
    skillSet: ['common', 'frontend'],
    promptHint:
      'Start by understanding the running app, then bias toward a working preview URL and crisp visual polish.',
  },
  {
    slug: 'docs',
    name: 'Docs Writer',
    description:
      'Optimized for READMEs, changelogs, API docs, MDX, and concise maintainable documentation.',
    priceUsd: 0.18,
    priceLabel: '$0.18',
    accent: 'seafoam',
    active: true,
    x402Enabled: true,
    chain: BASE_SEPOLIA_CAIP2,
    oasfDomains: ['technology/software_engineering', 'education/technical_writing'],
    oasfSkills: ['developer_documentation', 'documentation_maintenance'],
    skillSet: ['common', 'docs'],
    promptHint:
      'Prefer accurate, maintainable documentation that reflects the current codebase instead of aspirational docs.',
  },
]

export function isAgentSlug(value: string): value is AgentSlug {
  return value === 'frontend' || value === 'docs'
}

export function getAgentProfile(slug: AgentSlug) {
  return PLATFORM_AGENT_PROFILES.find((profile) => profile.slug === slug)!
}

export function repoSlug(fullName: string) {
  return fullName.replace(/\//g, '--').toLowerCase()
}
