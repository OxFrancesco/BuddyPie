import type { Id } from '../../convex/_generated/dataModel'
import {
  type AgentSlug,
  PLATFORM_OWNER_ID,
  getAgentProfile,
} from './buddypie-config'
import { createServerConvexClient, convexApi } from './convex-server'
import {
  abortPiRun,
  commitRepoChanges,
  createRepoBranch,
  ensureRepoClone,
  ensureSandbox,
  getDaytonaClient,
  getRepoGitState,
  getSignedPreviewUrl,
  pushRepoChanges,
  startPiRun,
  syncRepoClone,
  syncRunLogs,
  uploadBuddyPiAssets,
  sendRunMessage,
} from './daytona'
import {
  createGitHubPullRequest,
  fetchGitHubRepo,
  parseGitHubRepoInput,
} from './github'
import { getRemotePiSessionDir, getRemoteRepoPath } from './pi'

type GitIdentity = {
  name: string
  email: string
}

async function getWorkspaceRuntimeContext(options: {
  workspaceId: Id<'workspaces'>
  requesterId: string
}) {
  const convex = await createServerConvexClient({ useViewerToken: false })
  const workspace = await convex.query(convexApi.buddypie.workspaceForServer, {
    workspaceId: options.workspaceId,
    requesterId: options.requesterId,
  })

  if (!workspace) {
    throw new Error('Workspace not found')
  }

  if (!workspace.sandboxId || !workspace.repoPath) {
    throw new Error('Workspace sandbox is not ready yet')
  }

  const sandbox = await getDaytonaClient().get(workspace.sandboxId)
  await sandbox.start(60)

  return {
    convex,
    workspace,
    sandbox,
  }
}

async function persistWorkspaceGitMetadata(options: {
  convex: Awaited<ReturnType<typeof createServerConvexClient>>
  workspaceId: Id<'workspaces'>
  git: Awaited<ReturnType<typeof getRepoGitState>>
  lastCommitSha?: string
  lastPullRequestUrl?: string
}) {
  return options.convex.mutation(convexApi.buddypie.recordWorkspaceGitMetadata, {
    workspaceId: options.workspaceId,
    branch: options.git.currentBranch,
    gitBranchPublished: options.git.branchPublished,
    gitAhead: options.git.ahead,
    gitBehind: options.git.behind,
    gitDirty: options.git.dirty,
    lastCommitSha: options.lastCommitSha,
    lastPullRequestUrl: options.lastPullRequestUrl,
  })
}

export async function importWorkspace(options: {
  ownerId: string
  repoInput: string
  githubAccessToken?: string
}) {
  const convex = await createServerConvexClient({ useViewerToken: false })
  await convex.mutation(convexApi.buddypie.seedAgentProfiles, {})

  const parsedRepo = parseGitHubRepoInput(options.repoInput)
  const repoFullName = `${parsedRepo.repoOwner}/${parsedRepo.repoName}`
  const repo = await fetchGitHubRepo(repoFullName, options.githubAccessToken)

  const prepared = await convex.mutation(convexApi.buddypie.prepareWorkspaceImport, {
    ownerId: options.ownerId,
    repoFullName: repo.fullName,
    repoOwner: repo.owner,
    repoName: repo.name,
    repoUrl: repo.htmlUrl,
    cloneUrl: repo.cloneUrl,
    defaultBranch: repo.defaultBranch,
    visibility: repo.private ? 'private' : 'public',
  })

  const workspace = await convex.query(convexApi.buddypie.workspaceForServer, {
    workspaceId: prepared.workspaceId,
    requesterId: options.ownerId,
  })

  if (!workspace) {
    throw new Error('Workspace record was not created')
  }

  if (workspace.status === 'ready' && workspace.sandboxId && workspace.repoPath) {
    return workspace
  }

  const repoPath = getRemoteRepoPath(repo.fullName)

  try {
    const sandbox = await ensureSandbox({
      ownerId: options.ownerId,
      workspaceId: String(prepared.workspaceId),
      repoFullName: repo.fullName,
      existingSandboxId: workspace.sandboxId,
    })

    await uploadBuddyPiAssets(sandbox)
    await ensureRepoClone({
      sandbox,
      repoPath,
      cloneUrl: repo.cloneUrl,
      branch: repo.defaultBranch,
      accessToken: options.githubAccessToken,
    })

    const git = await getRepoGitState({
      sandbox,
      repoPath,
    })

    await convex.mutation(convexApi.buddypie.finalizeWorkspaceImport, {
      workspaceId: prepared.workspaceId,
      sandboxId: sandbox.id,
      sandboxName: sandbox.name,
      repoPath,
      branch: git.currentBranch,
      previewUrlPattern: `${repoPath}:<port>`,
    })

    return await persistWorkspaceGitMetadata({
      convex,
      workspaceId: prepared.workspaceId,
      git,
    })
  } catch (error) {
    await convex.mutation(convexApi.buddypie.failWorkspaceImport, {
      workspaceId: prepared.workspaceId,
      errorMessage: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export async function syncWorkspace(options: {
  workspaceId: Id<'workspaces'>
  requesterId: string
  githubAccessToken?: string
}) {
  const { convex, workspace, sandbox } = await getWorkspaceRuntimeContext({
    workspaceId: options.workspaceId,
    requesterId: options.requesterId,
  })
  await uploadBuddyPiAssets(sandbox)
  await syncRepoClone({
    sandbox,
    repoPath: workspace.repoPath,
    accessToken: options.githubAccessToken,
  })

  const git = await getRepoGitState({
    sandbox,
    repoPath: workspace.repoPath,
  })

  await convex.mutation(convexApi.buddypie.recordWorkspaceSync, {
    workspaceId: options.workspaceId,
    branch: git.currentBranch,
    status: 'ready',
  })

  return await persistWorkspaceGitMetadata({
    convex,
    workspaceId: options.workspaceId,
    git,
  })
}

export async function startWorkspaceRun(options: {
  workspaceId: Id<'workspaces'>
  requesterId: string
  agentSlug: AgentSlug
  prompt: string
  paymentReceipt?: unknown
  payerWallet?: string
}) {
  const convex = await createServerConvexClient({ useViewerToken: false })
  const workspace = await convex.query(convexApi.buddypie.workspaceForServer, {
    workspaceId: options.workspaceId,
    requesterId: options.requesterId,
  })

  if (!workspace) {
    throw new Error('Workspace not found')
  }

  if (!workspace.sandboxId || !workspace.repoPath) {
    throw new Error('Workspace sandbox is not ready yet')
  }

  const agentConfig = await convex.query(convexApi.buddypie.agentRunConfig, {
    agentSlug: options.agentSlug,
  })
  const agentProfile = agentConfig?.profile ?? getAgentProfile(options.agentSlug)
  const providerId = agentConfig?.defaultModelConfig?.providerId
  const modelId = agentConfig?.defaultModelConfig?.modelId
  const preparedRun = await convex.mutation(convexApi.buddypie.prepareRun, {
    ownerId: workspace.ownerId,
    workspaceId: options.workspaceId,
    agentSlug: options.agentSlug,
    sessionPath: getRemotePiSessionDir(String(options.workspaceId), options.agentSlug),
    priceUsd: agentProfile.priceUsd,
    providerId,
    modelId,
    lastPrompt: options.prompt,
    payerWallet: options.payerWallet,
    paymentReceipt: options.paymentReceipt,
  })

  if (!preparedRun.created) {
    return await convex.query(convexApi.buddypie.runForServer, {
      runId: preparedRun.runId,
      requesterId: options.requesterId,
    })
  }

  const sandbox = await getDaytonaClient().get(workspace.sandboxId)
  await sandbox.start(60)

  const started = await startPiRun({
    sandbox,
    runId: String(preparedRun.runId),
    workspaceId: String(options.workspaceId),
    agentSlug: options.agentSlug,
    repoPath: workspace.repoPath,
    repoFullName: workspace.repoFullName,
    prompt: options.prompt,
    provider: providerId,
    model: modelId,
  })

  await convex.mutation(convexApi.buddypie.updateRunTransport, {
    runId: preparedRun.runId,
    status: 'active',
    sandboxSessionId: started.sandboxSessionId,
    commandId: started.commandId,
    paymentReceipt: options.paymentReceipt,
    payerWallet: options.payerWallet,
    lastPrompt: options.prompt,
    lastEventAt: Date.now(),
  })

  if (options.paymentReceipt) {
    await convex.mutation(convexApi.buddypie.recordPayment, {
      ownerId: workspace.ownerId,
      workspaceId: options.workspaceId,
      runId: preparedRun.runId,
      agentSlug: options.agentSlug,
      status: 'verified',
      walletAddress: options.payerWallet,
      chain: agentProfile.chain,
      network: agentProfile.chain,
      amountUsd: agentProfile.priceUsd,
      priceLabel: agentProfile.priceLabel,
      receipt: options.paymentReceipt,
    })
  }

  await new Promise((resolve) => setTimeout(resolve, 1200))
  await refreshRun({
    runId: preparedRun.runId,
    requesterId: options.requesterId,
  })

  return await convex.query(convexApi.buddypie.runForServer, {
    runId: preparedRun.runId,
    requesterId: options.requesterId,
  })
}

export async function postRunMessage(options: {
  runId: Id<'runs'>
  requesterId: string
  prompt: string
}) {
  const convex = await createServerConvexClient({ useViewerToken: false })
  const context = await convex.query(convexApi.buddypie.runForServer, {
    runId: options.runId,
    requesterId: options.requesterId,
  })

  if (!context) {
    throw new Error('Run not found')
  }

  const { run, workspace } = context
  if (!workspace.sandboxId || !workspace.repoPath || !run.sandboxSessionId || !run.commandId) {
    throw new Error('Run transport is unavailable')
  }

  const sandbox = await getDaytonaClient().get(workspace.sandboxId)
  await sandbox.start(60)

  await sendRunMessage({
    sandbox,
    sandboxSessionId: run.sandboxSessionId,
    commandId: run.commandId,
    agentSlug: run.agentSlug as AgentSlug,
    repoFullName: workspace.repoFullName,
    repoPath: workspace.repoPath,
    prompt: options.prompt,
    asFollowUp: true,
  })

  await convex.mutation(convexApi.buddypie.updateRunTransport, {
    runId: options.runId,
    status: 'active',
    lastPrompt: options.prompt,
    lastEventAt: Date.now(),
  })

  await new Promise((resolve) => setTimeout(resolve, 800))
  await refreshRun({
    runId: options.runId,
    requesterId: options.requesterId,
  })

  return await convex.query(convexApi.buddypie.runForServer, {
    runId: options.runId,
    requesterId: options.requesterId,
  })
}

export async function refreshRun(options: {
  runId: Id<'runs'>
  requesterId: string
}) {
  const convex = await createServerConvexClient({ useViewerToken: false })
  const context = await convex.query(convexApi.buddypie.runForServer, {
    runId: options.runId,
    requesterId: options.requesterId,
  })

  if (!context) {
    throw new Error('Run not found')
  }

  const { run, workspace } = context
  if (!workspace.sandboxId || !run.sandboxSessionId || !run.commandId) {
    return context
  }

  const sandbox = await getDaytonaClient().get(workspace.sandboxId)
  await sandbox.start(60)
  const synced = await syncRunLogs({
    sandbox,
    sandboxSessionId: run.sandboxSessionId,
    commandId: run.commandId,
    previousOffset: run.logOffset,
  })

  await convex.mutation(convexApi.buddypie.applyRunLogSync, {
    runId: options.runId,
    logOffset: synced.logOffset,
    status: synced.status ?? run.status,
    previewPort: synced.previewPort,
    events: synced.events,
  })

  return await convex.query(convexApi.buddypie.runForServer, {
    runId: options.runId,
    requesterId: options.requesterId,
  })
}

export async function abortRun(options: {
  runId: Id<'runs'>
  requesterId: string
}) {
  const convex = await createServerConvexClient({ useViewerToken: false })
  const context = await convex.query(convexApi.buddypie.runForServer, {
    runId: options.runId,
    requesterId: options.requesterId,
  })

  if (!context) {
    throw new Error('Run not found')
  }

  const { run, workspace } = context
  if (workspace.sandboxId && run.sandboxSessionId && run.commandId) {
    const sandbox = await getDaytonaClient().get(workspace.sandboxId)
    await sandbox.start(60)
    await abortPiRun({
      sandbox,
      sandboxSessionId: run.sandboxSessionId,
      commandId: run.commandId,
    })
  }

  return convex.mutation(convexApi.buddypie.markRunAborted, {
    runId: options.runId,
  })
}

export async function getPreviewLink(options: {
  workspaceId: Id<'workspaces'>
  requesterId: string
}) {
  const convex = await createServerConvexClient({ useViewerToken: false })
  const workspace = await convex.query(convexApi.buddypie.workspaceForServer, {
    workspaceId: options.workspaceId,
    requesterId: options.requesterId,
  })

  if (!workspace) {
    throw new Error('Workspace not found')
  }

  if (!workspace.sandboxId || !workspace.previewPort) {
    return {
      url: null,
      port: workspace.previewPort ?? null,
    }
  }

  const sandbox = await getDaytonaClient().get(workspace.sandboxId)
  await sandbox.start(60)
  const signed = await getSignedPreviewUrl(sandbox, workspace.previewPort)

  return {
    url: signed.url,
    port: workspace.previewPort,
  }
}

export async function getWorkspaceGitStatus(options: {
  workspaceId: Id<'workspaces'>
  requesterId: string
}) {
  const { convex, workspace, sandbox } = await getWorkspaceRuntimeContext(options)
  const git = await getRepoGitState({
    sandbox,
    repoPath: workspace.repoPath,
  })
  const updatedWorkspace = await persistWorkspaceGitMetadata({
    convex,
    workspaceId: options.workspaceId,
    git,
  })

  return {
    workspace: updatedWorkspace,
    git,
  }
}

export async function createWorkspaceBranch(options: {
  workspaceId: Id<'workspaces'>
  requesterId: string
  branchName: string
  checkout?: boolean
}) {
  const { convex, workspace, sandbox } = await getWorkspaceRuntimeContext(options)
  const created = await createRepoBranch({
    sandbox,
    repoPath: workspace.repoPath,
    branchName: options.branchName,
    checkout: options.checkout,
  })
  const updatedWorkspace = await persistWorkspaceGitMetadata({
    convex,
    workspaceId: options.workspaceId,
    git: created.git,
  })

  return {
    workspace: updatedWorkspace,
    git: created.git,
    branchName: created.branchName,
  }
}

export async function commitWorkspaceChanges(options: {
  workspaceId: Id<'workspaces'>
  requesterId: string
  message: string
  files?: string[]
  author: GitIdentity
}) {
  const { convex, workspace, sandbox } = await getWorkspaceRuntimeContext(options)
  const gitBeforeCommit = await getRepoGitState({
    sandbox,
    repoPath: workspace.repoPath,
  })

  const files =
    options.files && options.files.length > 0
      ? Array.from(new Set(options.files))
      : gitBeforeCommit.fileStatus.map((file) => file.name)

  if (files.length === 0) {
    throw new Error('No changed files are available to commit.')
  }

  const committed = await commitRepoChanges({
    sandbox,
    repoPath: workspace.repoPath,
    files,
    message: options.message,
    author: options.author.name,
    email: options.author.email,
  })
  const updatedWorkspace = await persistWorkspaceGitMetadata({
    convex,
    workspaceId: options.workspaceId,
    git: committed.git,
    lastCommitSha: committed.commitSha,
  })

  return {
    workspace: updatedWorkspace,
    git: committed.git,
    commitSha: committed.commitSha,
  }
}

export async function pushWorkspaceChanges(options: {
  workspaceId: Id<'workspaces'>
  requesterId: string
  githubAccessToken?: string
}) {
  if (!options.githubAccessToken) {
    throw new Error('GitHub access token is unavailable. Reconnect GitHub and try again.')
  }

  const { convex, workspace, sandbox } = await getWorkspaceRuntimeContext(options)
  const git = await pushRepoChanges({
    sandbox,
    repoPath: workspace.repoPath,
    accessToken: options.githubAccessToken,
  })
  const updatedWorkspace = await persistWorkspaceGitMetadata({
    convex,
    workspaceId: options.workspaceId,
    git,
  })

  return {
    workspace: updatedWorkspace,
    git,
  }
}

export async function createWorkspacePullRequest(options: {
  workspaceId: Id<'workspaces'>
  requesterId: string
  title: string
  body?: string
  baseBranch?: string
  draft?: boolean
  githubAccessToken?: string
}) {
  if (!options.githubAccessToken) {
    throw new Error('GitHub access token is unavailable. Reconnect GitHub and try again.')
  }

  const { convex, workspace, sandbox } = await getWorkspaceRuntimeContext(options)
  let git = await getRepoGitState({
    sandbox,
    repoPath: workspace.repoPath,
  })

  if (git.ahead > 0 || !git.branchPublished) {
    git = await pushRepoChanges({
      sandbox,
      repoPath: workspace.repoPath,
      accessToken: options.githubAccessToken,
    })
  }

  const repo = await fetchGitHubRepo(workspace.repoFullName, options.githubAccessToken)
  const baseBranch = options.baseBranch ?? repo.defaultBranch

  if (git.currentBranch === baseBranch) {
    throw new Error('Create or checkout a codex/* branch before opening a pull request.')
  }

  const pullRequest = await createGitHubPullRequest({
    repoFullName: workspace.repoFullName,
    accessToken: options.githubAccessToken,
    title: options.title,
    body: options.body,
    head: git.currentBranch,
    base: baseBranch,
    draft: options.draft,
  })

  const updatedWorkspace = await persistWorkspaceGitMetadata({
    convex,
    workspaceId: options.workspaceId,
    git,
    lastPullRequestUrl: pullRequest.url,
  })

  return {
    workspace: updatedWorkspace,
    git,
    pullRequest,
  }
}

export async function ensurePublicWorkspaceRun(options: {
  agentSlug: AgentSlug
  repoInput: string
  prompt: string
  paymentReceipt?: unknown
  payerWallet?: string
}) {
  const workspace = await importWorkspace({
    ownerId: PLATFORM_OWNER_ID,
    repoInput: options.repoInput,
  })

  return startWorkspaceRun({
    workspaceId: workspace._id,
    requesterId: PLATFORM_OWNER_ID,
    agentSlug: options.agentSlug,
    prompt: options.prompt,
    paymentReceipt: options.paymentReceipt,
    payerWallet: options.payerWallet,
  })
}
