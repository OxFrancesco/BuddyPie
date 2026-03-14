import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

const workspaceStatus = v.union(
  v.literal('provisioning'),
  v.literal('ready'),
  v.literal('syncing'),
  v.literal('error'),
  v.literal('archived'),
)

const runStatus = v.union(
  v.literal('starting'),
  v.literal('active'),
  v.literal('idle'),
  v.literal('aborted'),
  v.literal('completed'),
  v.literal('error'),
)

const paymentStatus = v.union(
  v.literal('pending'),
  v.literal('verified'),
  v.literal('settled'),
  v.literal('failed'),
)

export default defineSchema({
  repositories: defineTable({
    ownerId: v.string(),
    provider: v.literal('github'),
    repoFullName: v.string(),
    repoOwner: v.string(),
    repoName: v.string(),
    repoUrl: v.string(),
    cloneUrl: v.string(),
    defaultBranch: v.string(),
    visibility: v.union(v.literal('public'), v.literal('private')),
    updatedAt: v.number(),
  })
    .index('by_owner_repo', ['ownerId', 'repoFullName'])
    .index('by_repo_full_name', ['repoFullName']),

  workspaces: defineTable({
    ownerId: v.string(),
    repositoryId: v.optional(v.id('repositories')),
    repoFullName: v.string(),
    repoOwner: v.string(),
    repoName: v.string(),
    repoUrl: v.string(),
    cloneUrl: v.string(),
    branch: v.string(),
    repoPath: v.optional(v.string()),
    sandboxId: v.optional(v.string()),
    sandboxName: v.optional(v.string()),
    status: workspaceStatus,
    isPublicRepo: v.boolean(),
    errorMessage: v.optional(v.string()),
    previewPort: v.optional(v.number()),
    previewUrlPattern: v.optional(v.string()),
    gitBranchPublished: v.optional(v.boolean()),
    gitAhead: v.optional(v.number()),
    gitBehind: v.optional(v.number()),
    gitDirty: v.optional(v.boolean()),
    lastCommitSha: v.optional(v.string()),
    lastPullRequestUrl: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    lastRunAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_owner', ['ownerId', 'updatedAt'])
    .index('by_owner_repo', ['ownerId', 'repoFullName'])
    .index('by_sandbox_id', ['sandboxId'])
    .index('by_repo_full_name', ['repoFullName']),

  agentProfiles: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    priceUsd: v.number(),
    priceLabel: v.string(),
    accent: v.string(),
    active: v.boolean(),
    x402Enabled: v.boolean(),
    chain: v.string(),
    oasfDomains: v.array(v.string()),
    oasfSkills: v.array(v.string()),
    promptHint: v.string(),
    updatedAt: v.number(),
  }).index('by_slug', ['slug']),

  agentModelCatalog: defineTable({
    agentSlug: v.string(),
    providerId: v.string(),
    providerLabel: v.optional(v.string()),
    modelId: v.string(),
    modelLabel: v.optional(v.string()),
    enabled: v.boolean(),
    isDefault: v.boolean(),
    authType: v.optional(v.string()),
    api: v.optional(v.string()),
    baseUrl: v.optional(v.string()),
    apiKeyEnvNames: v.array(v.string()),
    supportsReasoning: v.optional(v.boolean()),
    supportsImages: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index('by_agent', ['agentSlug', 'providerId', 'modelId'])
    .index('by_agent_default', ['agentSlug', 'isDefault'])
    .index('by_agent_provider', ['agentSlug', 'providerId']),

  runs: defineTable({
    ownerId: v.string(),
    workspaceId: v.id('workspaces'),
    agentSlug: v.string(),
    providerId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    status: runStatus,
    sessionPath: v.string(),
    sandboxSessionId: v.optional(v.string()),
    commandId: v.optional(v.string()),
    logOffset: v.optional(v.number()),
    lastPrompt: v.optional(v.string()),
    paymentReceipt: v.optional(v.any()),
    payerWallet: v.optional(v.string()),
    priceUsd: v.number(),
    previewPort: v.optional(v.number()),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    lastEventAt: v.optional(v.number()),
  })
    .index('by_workspace', ['workspaceId', 'startedAt'])
    .index('by_workspace_agent', ['workspaceId', 'agentSlug', 'startedAt'])
    .index('by_owner', ['ownerId', 'startedAt']),

  runEvents: defineTable({
    ownerId: v.string(),
    workspaceId: v.id('workspaces'),
    runId: v.id('runs'),
    type: v.string(),
    role: v.optional(v.string()),
    content: v.optional(v.string()),
    previewPort: v.optional(v.number()),
    raw: v.optional(v.any()),
    createdAt: v.number(),
  }).index('by_run', ['runId', 'createdAt']),

  payments: defineTable({
    ownerId: v.string(),
    workspaceId: v.optional(v.id('workspaces')),
    runId: v.optional(v.id('runs')),
    agentSlug: v.string(),
    status: paymentStatus,
    walletAddress: v.optional(v.string()),
    chain: v.string(),
    network: v.string(),
    amountUsd: v.number(),
    priceLabel: v.string(),
    receipt: v.optional(v.any()),
    settlement: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_run', ['runId'])
    .index('by_owner', ['ownerId', 'createdAt']),

  erc8004Registrations: defineTable({
    agentSlug: v.string(),
    chain: v.string(),
    network: v.string(),
    agentId: v.string(),
    agentUri: v.string(),
    registrationUri: v.string(),
    a2aUrl: v.string(),
    mcpUrl: v.string(),
    active: v.boolean(),
    x402Support: v.boolean(),
    txHash: v.optional(v.string()),
    metadata: v.optional(v.any()),
    updatedAt: v.number(),
  }).index('by_slug_chain', ['agentSlug', 'chain']),
})
