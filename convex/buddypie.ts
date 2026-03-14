import { v } from 'convex/values'
import {
  DEFAULT_AGENT_MODEL_SELECTIONS,
  createDefaultAgentModelCatalog,
} from '../src/lib/pi-provider-catalog'
import type { Doc, Id } from './_generated/dataModel'
import { mutation, query } from './_generated/server'

const PLATFORM_OWNER_ID = 'platform-public'
const agentSlugValidator = v.union(v.literal('frontend'), v.literal('docs'))
const agentModelCatalogEntryInput = v.object({
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
})

const DEFAULT_AGENT_PROFILES = [
  {
    slug: 'frontend',
    name: 'Frontend Builder',
    description:
      'Optimized for UI changes, dev servers, previews, and polished frontend workflows.',
    priceUsd: 0.35,
    priceLabel: '$0.35',
    accent: 'sunrise',
    active: true,
    x402Enabled: true,
    chain: 'eip155:84532',
    oasfDomains: ['technology/software_engineering', 'design/user_interfaces'],
    oasfSkills: ['frontend_development', 'developer_documentation'],
    promptHint:
      'Bias toward getting the app running quickly and surfacing a preview URL as early as possible.',
  },
  {
    slug: 'docs',
    name: 'Docs Writer',
    description:
      'Optimized for READMEs, changelogs, MDX, API docs, and concise technical writing.',
    priceUsd: 0.18,
    priceLabel: '$0.18',
    accent: 'seafoam',
    active: true,
    x402Enabled: true,
    chain: 'eip155:84532',
    oasfDomains: ['technology/software_engineering', 'education/technical_writing'],
    oasfSkills: ['developer_documentation', 'documentation_maintenance'],
    promptHint:
      'Bias toward clear, maintainable documentation and concise written output.',
  },
] as const
const DEFAULT_AGENT_MODEL_CATALOG = createDefaultAgentModelCatalog()

async function ensureDefaultProfiles(ctx: any) {
  const now = Date.now()
  for (const profile of DEFAULT_AGENT_PROFILES) {
    const existing = await ctx.db
      .query('agentProfiles')
      .withIndex('by_slug', (q: any) => q.eq('slug', profile.slug))
      .unique()

    if (existing) {
      continue
    }

    await ctx.db.insert('agentProfiles', {
      ...profile,
      updatedAt: now,
    })
  }
}

async function ensureDefaultAgentModelCatalog(ctx: any) {
  const now = Date.now()

  for (const profile of DEFAULT_AGENT_PROFILES) {
    for (const entry of DEFAULT_AGENT_MODEL_CATALOG) {
      const defaultSelection =
        DEFAULT_AGENT_MODEL_SELECTIONS[
          profile.slug as keyof typeof DEFAULT_AGENT_MODEL_SELECTIONS
        ]
      const seededEntry = {
        ...entry,
        isDefault:
          defaultSelection?.providerId === entry.providerId &&
          defaultSelection?.modelId === entry.modelId,
      }
      const existing = await ctx.db
        .query('agentModelCatalog')
        .withIndex('by_agent', (q: any) =>
          q
            .eq('agentSlug', profile.slug)
            .eq('providerId', seededEntry.providerId)
            .eq('modelId', seededEntry.modelId),
        )
        .unique()

      if (existing) {
        continue
      }

      await ctx.db.insert('agentModelCatalog', {
        agentSlug: profile.slug,
        ...seededEntry,
        updatedAt: now,
      })
    }
  }
}

async function getAgentModelCatalog(ctx: any, agentSlug: 'frontend' | 'docs') {
  return (await ctx.db
    .query('agentModelCatalog')
    .withIndex('by_agent', (q: any) => q.eq('agentSlug', agentSlug))
    .collect()
  ).sort((left: any, right: any) => {
    if (left.providerId === right.providerId) {
      return left.modelId.localeCompare(right.modelId)
    }

    return left.providerId.localeCompare(right.providerId)
  })
}

async function upsertAgentModelCatalogEntry(
  ctx: any,
  agentSlug: 'frontend' | 'docs',
  entry: any,
) {
  const existing = await ctx.db
    .query('agentModelCatalog')
    .withIndex('by_agent', (q: any) =>
      q
        .eq('agentSlug', agentSlug)
        .eq('providerId', entry.providerId)
        .eq('modelId', entry.modelId),
    )
    .unique()

  if (entry.isDefault) {
    const currentDefaults = await ctx.db
      .query('agentModelCatalog')
      .withIndex('by_agent_default', (q: any) =>
        q.eq('agentSlug', agentSlug).eq('isDefault', true),
      )
      .collect()

    for (const currentDefault of currentDefaults) {
      if (
        currentDefault.providerId === entry.providerId &&
        currentDefault.modelId === entry.modelId
      ) {
        continue
      }

      await ctx.db.patch(currentDefault._id, {
        isDefault: false,
        updatedAt: Date.now(),
      })
    }
  }

  const now = Date.now()
  if (existing) {
    await ctx.db.patch(existing._id, {
      ...entry,
      updatedAt: now,
    })
    return await ctx.db.get(existing._id)
  }

  const recordId = await ctx.db.insert('agentModelCatalog', {
    agentSlug,
    ...entry,
    updatedAt: now,
  })

  return await ctx.db.get(recordId)
}

function toDashboardWorkspace(workspace: Doc<'workspaces'>, runs: Array<Doc<'runs'>>) {
  const latestRun = runs.sort((left, right) => right.startedAt - left.startedAt)[0]

  return {
    ...workspace,
    latestRun,
  }
}

async function getWorkspaceWithAccess(
  ctx: {
    db: {
      get: (id: Id<'workspaces'>) => Promise<Doc<'workspaces'> | null>
    }
  },
  workspaceId: Id<'workspaces'>,
  viewerId?: string,
) {
  const workspace = await ctx.db.get(workspaceId)

  if (!workspace) {
    return null
  }

  if (workspace.ownerId === PLATFORM_OWNER_ID) {
    return workspace
  }

  if (!viewerId || workspace.ownerId !== viewerId) {
    return null
  }

  return workspace
}

export const seedAgentProfiles = mutation({
  args: {},
  handler: async (ctx) => {
    await ensureDefaultProfiles(ctx)
    await ensureDefaultAgentModelCatalog(ctx)
    return true
  },
})

export const agentRunConfig = query({
  args: {
    agentSlug: agentSlugValidator,
  },
  handler: async (ctx, { agentSlug }) => {
    const profile = await ctx.db
      .query('agentProfiles')
      .withIndex('by_slug', (q) => q.eq('slug', agentSlug))
      .unique()

    const modelCatalog = await getAgentModelCatalog(ctx, agentSlug)

    return {
      profile,
      modelCatalog,
      defaultModelConfig:
        modelCatalog.find((entry: any) => entry.enabled && entry.isDefault) ?? null,
    }
  },
})

export const agentModelCatalogByAgent = query({
  args: {
    agentSlug: agentSlugValidator,
  },
  handler: async (ctx, { agentSlug }) => {
    return getAgentModelCatalog(ctx, agentSlug)
  },
})

export const upsertAgentModelConfig = mutation({
  args: {
    agentSlug: agentSlugValidator,
    entry: agentModelCatalogEntryInput,
  },
  handler: async (ctx, { agentSlug, entry }) => {
    return await upsertAgentModelCatalogEntry(ctx, agentSlug, entry)
  },
})

export const replaceAgentModelCatalog = mutation({
  args: {
    agentSlug: agentSlugValidator,
    entries: v.array(agentModelCatalogEntryInput),
  },
  handler: async (ctx, { agentSlug, entries }) => {
    const defaultEntries = entries.filter((entry) => entry.isDefault)
    if (defaultEntries.length > 1) {
      throw new Error('Only one default provider/model can be set per agent')
    }

    const existing = await ctx.db
      .query('agentModelCatalog')
      .withIndex('by_agent', (q) => q.eq('agentSlug', agentSlug))
      .collect()

    const incomingKeys = new Set(
      entries.map((entry) => `${entry.providerId}::${entry.modelId}`),
    )

    for (const existingEntry of existing) {
      const key = `${existingEntry.providerId}::${existingEntry.modelId}`
      if (!incomingKeys.has(key)) {
        await ctx.db.delete(existingEntry._id)
      }
    }

    for (const entry of entries) {
      await upsertAgentModelCatalogEntry(ctx, agentSlug, entry)
    }

    return await getAgentModelCatalog(ctx, agentSlug)
  },
})

export const removeAgentModelConfig = mutation({
  args: {
    agentSlug: agentSlugValidator,
    providerId: v.string(),
    modelId: v.string(),
  },
  handler: async (ctx, { agentSlug, providerId, modelId }) => {
    const existing = await ctx.db
      .query('agentModelCatalog')
      .withIndex('by_agent', (q) =>
        q.eq('agentSlug', agentSlug).eq('providerId', providerId).eq('modelId', modelId),
      )
      .unique()

    if (!existing) {
      return null
    }

    await ctx.db.delete(existing._id)
    return true
  },
})

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    const ownerId = identity?.subject
    const profiles = await ctx.db.query('agentProfiles').collect()

    if (!ownerId) {
      return {
        ownerId: null,
        agentProfiles: profiles.length > 0 ? profiles : DEFAULT_AGENT_PROFILES,
        workspaces: [],
      }
    }

    const workspaces = await ctx.db
      .query('workspaces')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .collect()

    const runs = await ctx.db
      .query('runs')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .collect()

    return {
      ownerId,
      agentProfiles: profiles.length > 0 ? profiles : DEFAULT_AGENT_PROFILES,
      workspaces: workspaces
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((workspace) =>
          toDashboardWorkspace(
            workspace,
            runs.filter((run) => run.workspaceId === workspace._id),
          ),
        ),
    }
  },
})

export const workspaceDetail = query({
  args: {
    workspaceId: v.id('workspaces'),
  },
  handler: async (ctx, { workspaceId }) => {
    const identity = await ctx.auth.getUserIdentity()
    const viewerId = identity?.subject
    const workspace = await getWorkspaceWithAccess(ctx, workspaceId, viewerId)

    if (!workspace) {
      return null
    }

    const repository = workspace.repositoryId
      ? await ctx.db.get(workspace.repositoryId)
      : null

    const runs = await ctx.db
      .query('runs')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
      .collect()

    const sortedRuns = runs.sort((left, right) => right.startedAt - left.startedAt)
    const activeRun = sortedRuns.find((run) =>
      ['starting', 'active', 'idle'].includes(run.status),
    )

    const runEvents =
      activeRun
        ? await ctx.db
            .query('runEvents')
            .withIndex('by_run', (q) => q.eq('runId', activeRun._id))
            .collect()
        : []

    return {
      workspace,
      repository,
      runs: sortedRuns,
      activeRun,
      runEvents: runEvents.sort((left, right) => left.createdAt - right.createdAt),
    }
  },
})

export const runEventsByRun = query({
  args: {
    runId: v.id('runs'),
  },
  handler: async (ctx, { runId }) => {
    const identity = await ctx.auth.getUserIdentity()
    const viewerId = identity?.subject
    const run = await ctx.db.get(runId)

    if (!run) {
      return []
    }

    const workspace = await ctx.db.get(run.workspaceId)
    if (!workspace) {
      return []
    }

    if (workspace.ownerId !== PLATFORM_OWNER_ID && workspace.ownerId !== viewerId) {
      return []
    }

    return (await ctx.db
      .query('runEvents')
      .withIndex('by_run', (q) => q.eq('runId', runId))
      .collect()
    ).sort((left, right) => left.createdAt - right.createdAt)
  },
})

export const workspaceForServer = query({
  args: {
    workspaceId: v.id('workspaces'),
    requesterId: v.optional(v.string()),
  },
  handler: async (ctx, { workspaceId, requesterId }) => {
    return getWorkspaceWithAccess(ctx, workspaceId, requesterId)
  },
})

export const runForServer = query({
  args: {
    runId: v.id('runs'),
    requesterId: v.optional(v.string()),
  },
  handler: async (ctx, { runId, requesterId }) => {
    const run = await ctx.db.get(runId)
    if (!run) {
      return null
    }

    const workspace = await getWorkspaceWithAccess(ctx, run.workspaceId, requesterId)
    if (!workspace) {
      return null
    }

    return {
      run,
      workspace,
    }
  },
})

export const findWorkspaceByRepo = query({
  args: {
    ownerId: v.string(),
    repoFullName: v.string(),
  },
  handler: async (ctx, { ownerId, repoFullName }) => {
    return ctx.db
      .query('workspaces')
      .withIndex('by_owner_repo', (q) =>
        q.eq('ownerId', ownerId).eq('repoFullName', repoFullName),
      )
      .unique()
  },
})

export const prepareWorkspaceImport = mutation({
  args: {
    ownerId: v.string(),
    repoFullName: v.string(),
    repoOwner: v.string(),
    repoName: v.string(),
    repoUrl: v.string(),
    cloneUrl: v.string(),
    defaultBranch: v.string(),
    visibility: v.union(v.literal('public'), v.literal('private')),
  },
  handler: async (ctx, args) => {
    await ensureDefaultProfiles(ctx)
    const now = Date.now()

    let repository = await ctx.db
      .query('repositories')
      .withIndex('by_owner_repo', (q) =>
        q.eq('ownerId', args.ownerId).eq('repoFullName', args.repoFullName),
      )
      .unique()

    if (!repository) {
      const repositoryId = await ctx.db.insert('repositories', {
        ownerId: args.ownerId,
        provider: 'github',
        repoFullName: args.repoFullName,
        repoOwner: args.repoOwner,
        repoName: args.repoName,
        repoUrl: args.repoUrl,
        cloneUrl: args.cloneUrl,
        defaultBranch: args.defaultBranch,
        visibility: args.visibility,
        updatedAt: now,
      })
      repository = await ctx.db.get(repositoryId)
    } else {
      await ctx.db.patch(repository._id, {
        repoUrl: args.repoUrl,
        cloneUrl: args.cloneUrl,
        defaultBranch: args.defaultBranch,
        visibility: args.visibility,
        updatedAt: now,
      })
      repository = await ctx.db.get(repository._id)
    }

    if (!repository) {
      throw new Error('Failed to create repository record')
    }

    const existingWorkspace = await ctx.db
      .query('workspaces')
      .withIndex('by_owner_repo', (q) =>
        q.eq('ownerId', args.ownerId).eq('repoFullName', args.repoFullName),
      )
      .unique()

    if (existingWorkspace) {
      await ctx.db.patch(existingWorkspace._id, {
        repositoryId: repository._id,
        repoUrl: args.repoUrl,
        cloneUrl: args.cloneUrl,
        status:
          existingWorkspace.sandboxId && existingWorkspace.status === 'ready'
            ? existingWorkspace.status
            : 'provisioning',
        updatedAt: now,
        errorMessage: undefined,
      })
      return {
        workspaceId: existingWorkspace._id,
        repositoryId: repository._id,
        existed: true,
      }
    }

    const workspaceId = await ctx.db.insert('workspaces', {
      ownerId: args.ownerId,
      repositoryId: repository._id,
      repoFullName: args.repoFullName,
      repoOwner: args.repoOwner,
      repoName: args.repoName,
      repoUrl: args.repoUrl,
      cloneUrl: args.cloneUrl,
      branch: args.defaultBranch,
      status: 'provisioning',
      isPublicRepo: args.visibility === 'public',
      createdAt: now,
      updatedAt: now,
    })

    return {
      workspaceId,
      repositoryId: repository._id,
      existed: false,
    }
  },
})

export const finalizeWorkspaceImport = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    sandboxId: v.string(),
    sandboxName: v.string(),
    repoPath: v.string(),
    branch: v.string(),
    previewUrlPattern: v.optional(v.string()),
  },
  handler: async (ctx, { workspaceId, ...rest }) => {
    const now = Date.now()
    await ctx.db.patch(workspaceId, {
      ...rest,
      status: 'ready',
      lastSyncedAt: now,
      updatedAt: now,
      errorMessage: undefined,
    })
    return await ctx.db.get(workspaceId)
  },
})

export const failWorkspaceImport = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    errorMessage: v.string(),
  },
  handler: async (ctx, { workspaceId, errorMessage }) => {
    await ctx.db.patch(workspaceId, {
      status: 'error',
      errorMessage,
      updatedAt: Date.now(),
    })
    return await ctx.db.get(workspaceId)
  },
})

export const recordWorkspaceSync = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    branch: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal('ready'),
        v.literal('syncing'),
        v.literal('error'),
        v.literal('archived'),
      ),
    ),
    previewPort: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, { workspaceId, branch, status, previewPort, errorMessage }) => {
    const now = Date.now()
    await ctx.db.patch(workspaceId, {
      branch,
      status: status ?? 'ready',
      previewPort,
      errorMessage,
      lastSyncedAt: now,
      updatedAt: now,
    })
    return await ctx.db.get(workspaceId)
  },
})

export const recordWorkspaceGitMetadata = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    branch: v.optional(v.string()),
    gitBranchPublished: v.optional(v.boolean()),
    gitAhead: v.optional(v.number()),
    gitBehind: v.optional(v.number()),
    gitDirty: v.optional(v.boolean()),
    lastCommitSha: v.optional(v.string()),
    lastPullRequestUrl: v.optional(v.string()),
  },
  handler: async (ctx, { workspaceId, ...patch }) => {
    await ctx.db.patch(workspaceId, {
      ...patch,
      updatedAt: Date.now(),
    })
    return await ctx.db.get(workspaceId)
  },
})

export const prepareRun = mutation({
  args: {
    ownerId: v.string(),
    workspaceId: v.id('workspaces'),
    agentSlug: agentSlugValidator,
    sessionPath: v.string(),
    priceUsd: v.number(),
    providerId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    lastPrompt: v.optional(v.string()),
    payerWallet: v.optional(v.string()),
    paymentReceipt: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId)
    if (!workspace) {
      throw new Error('Workspace not found')
    }

    if (workspace.ownerId !== args.ownerId && workspace.ownerId !== PLATFORM_OWNER_ID) {
      throw new Error('Forbidden')
    }

    const existingRuns = await ctx.db
      .query('runs')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', args.workspaceId))
      .collect()

    const activeRun = existingRuns
      .sort((left, right) => right.startedAt - left.startedAt)
      .find((run) => ['starting', 'active', 'idle'].includes(run.status))

    if (activeRun) {
      return {
        created: false,
        runId: activeRun._id,
      }
    }

    const now = Date.now()
    const runId = await ctx.db.insert('runs', {
      ownerId: args.ownerId,
      workspaceId: args.workspaceId,
      agentSlug: args.agentSlug,
      providerId: args.providerId,
      modelId: args.modelId,
      status: 'starting',
      sessionPath: args.sessionPath,
      lastPrompt: args.lastPrompt,
      payerWallet: args.payerWallet,
      paymentReceipt: args.paymentReceipt,
      priceUsd: args.priceUsd,
      startedAt: now,
      lastEventAt: now,
    })

    await ctx.db.patch(args.workspaceId, {
      lastRunAt: now,
      updatedAt: now,
    })

    return {
      created: true,
      runId,
    }
  },
})

export const updateRunTransport = mutation({
  args: {
    runId: v.id('runs'),
    status: v.optional(
      v.union(
        v.literal('starting'),
        v.literal('active'),
        v.literal('idle'),
        v.literal('aborted'),
        v.literal('completed'),
        v.literal('error'),
      ),
    ),
    sandboxSessionId: v.optional(v.string()),
    commandId: v.optional(v.string()),
    logOffset: v.optional(v.number()),
    previewPort: v.optional(v.number()),
    lastPrompt: v.optional(v.string()),
    lastEventAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    paymentReceipt: v.optional(v.any()),
    payerWallet: v.optional(v.string()),
  },
  handler: async (ctx, { runId, ...patch }) => {
    await ctx.db.patch(runId, patch)
    const run = await ctx.db.get(runId)
    if (run && patch.previewPort) {
      await ctx.db.patch(run.workspaceId, {
        previewPort: patch.previewPort,
        updatedAt: Date.now(),
      })
    }
    return run
  },
})

export const applyRunLogSync = mutation({
  args: {
    runId: v.id('runs'),
    logOffset: v.number(),
    status: v.optional(
      v.union(
        v.literal('starting'),
        v.literal('active'),
        v.literal('idle'),
        v.literal('aborted'),
        v.literal('completed'),
        v.literal('error'),
      ),
    ),
    previewPort: v.optional(v.number()),
    events: v.array(
      v.object({
        type: v.string(),
        role: v.optional(v.string()),
        content: v.optional(v.string()),
        previewPort: v.optional(v.number()),
        raw: v.optional(v.any()),
        createdAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, { runId, logOffset, status, previewPort, events }) => {
    const now = Date.now()
    const run = await ctx.db.get(runId)
    if (!run) {
      throw new Error('Run not found')
    }

    for (const event of events) {
      await ctx.db.insert('runEvents', {
        ownerId: run.ownerId,
        workspaceId: run.workspaceId,
        runId,
        ...event,
      })
    }

    await ctx.db.patch(runId, {
      logOffset,
      status: status ?? run.status,
      previewPort: previewPort ?? run.previewPort,
      lastEventAt: now,
    })

    await ctx.db.patch(run.workspaceId, {
      previewPort: previewPort ?? run.previewPort,
      lastRunAt: now,
      updatedAt: now,
    })

    return await ctx.db.get(runId)
  },
})

export const markRunAborted = mutation({
  args: {
    runId: v.id('runs'),
  },
  handler: async (ctx, { runId }) => {
    const now = Date.now()
    await ctx.db.patch(runId, {
      status: 'aborted',
      endedAt: now,
      lastEventAt: now,
    })
    return await ctx.db.get(runId)
  },
})

export const recordPayment = mutation({
  args: {
    ownerId: v.string(),
    workspaceId: v.optional(v.id('workspaces')),
    runId: v.optional(v.id('runs')),
    agentSlug: v.union(v.literal('frontend'), v.literal('docs')),
    status: v.union(
      v.literal('pending'),
      v.literal('verified'),
      v.literal('settled'),
      v.literal('failed'),
    ),
    walletAddress: v.optional(v.string()),
    chain: v.string(),
    network: v.string(),
    amountUsd: v.number(),
    priceLabel: v.string(),
    receipt: v.optional(v.any()),
    settlement: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const paymentId = await ctx.db.insert('payments', {
      ...args,
      createdAt: now,
      updatedAt: now,
    })
    return await ctx.db.get(paymentId)
  },
})

export const upsertRegistration = mutation({
  args: {
    agentSlug: v.union(v.literal('frontend'), v.literal('docs')),
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
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('erc8004Registrations')
      .withIndex('by_slug_chain', (q) =>
        q.eq('agentSlug', args.agentSlug).eq('chain', args.chain),
      )
      .unique()

    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: now,
      })
      return await ctx.db.get(existing._id)
    }

    const registrationId = await ctx.db.insert('erc8004Registrations', {
      ...args,
      updatedAt: now,
    })
    return await ctx.db.get(registrationId)
  },
})
