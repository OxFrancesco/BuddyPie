import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { mutation, query } from './_generated/server'

const PLATFORM_OWNER_ID = 'platform-public'

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

async function ensureDefaultProfiles(ctx: any) {
  const now = Date.now()
  for (const profile of DEFAULT_AGENT_PROFILES) {
    const existing = await ctx.db
      .query('agentProfiles')
      .withIndex('by_slug', (q: any) => q.eq('slug', profile.slug))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...profile,
        updatedAt: now,
      })
      continue
    }

    await ctx.db.insert('agentProfiles', {
      ...profile,
      updatedAt: now,
    })
  }
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

  if (workspace.ownerId !== PLATFORM_OWNER_ID && viewerId && workspace.ownerId !== viewerId) {
    return null
  }

  return workspace
}

export const seedAgentProfiles = mutation({
  args: {},
  handler: async (ctx) => {
    await ensureDefaultProfiles(ctx)
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
        branch: args.defaultBranch,
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

export const prepareRun = mutation({
  args: {
    ownerId: v.string(),
    workspaceId: v.id('workspaces'),
    agentSlug: v.union(v.literal('frontend'), v.literal('docs')),
    sessionPath: v.string(),
    priceUsd: v.number(),
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
