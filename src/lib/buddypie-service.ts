import type { Doc, Id } from '../../convex/_generated/dataModel'
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
  getRepoGitState,
  getSignedPreviewUrl,
  isDaytonaNotFoundError,
  pushRepoChanges,
  resumePiRun,
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
import {
  getRemotePiSessionDir,
  getRemoteRepoPath,
  type ParsedRunEvent,
} from './pi'

type GitIdentity = {
  name: string
  email: string
}

type WorkspaceRecord = Doc<'workspaces'>
type ReadyWorkspaceRecord = WorkspaceRecord & { repoPath: string }
type RunRecord = Doc<'runs'>
type PersistedRunEvent = Doc<'runEvents'>
type SyncedRunLogs = Awaited<ReturnType<typeof syncRunLogs>>
type RunValidationEventType =
  | 'validation_pending'
  | 'validation_summary'
  | 'validation_warning'

type RunValidationEvent = {
  type: RunValidationEventType
  content: string
  raw?: Record<string, unknown>
  createdAt: number
}

type RunEventLike = Pick<PersistedRunEvent, 'type' | 'content' | 'createdAt'>

function quoteShell(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function isValidationEventType(value: string): value is RunValidationEventType {
  return (
    value === 'validation_pending' ||
    value === 'validation_summary' ||
    value === 'validation_warning'
  )
}

function createValidationPendingEvent(agentSlug: AgentSlug): RunValidationEvent {
  return {
    type: 'validation_pending',
    content:
      agentSlug === 'frontend'
        ? 'Waiting for a verified preview, concrete repo changes, or a substantive response.'
        : 'Waiting for repository-grounded docs changes or a substantive response.',
    createdAt: Date.now(),
    raw: {
      agentSlug,
    },
  }
}

function latestValidationEvent(events: RunEventLike[]) {
  return [...events].reverse().find((event) => isValidationEventType(event.type))
}

function summarizeChangedFiles(files: string[], maxFiles = 3) {
  if (files.length === 0) {
    return 'no changed files'
  }

  if (files.length <= maxFiles) {
    return files.join(', ')
  }

  return `${files.slice(0, maxFiles).join(', ')} (+${files.length - maxFiles} more)`
}

function collectAssistantTextLength(events: Array<RunEventLike | ParsedRunEvent>) {
  return events
    .filter((event) => event.type === 'assistant_delta' && typeof event.content === 'string')
    .map((event) => event.content)
    .join('')
    .trim().length
}

async function readChangedFileSizes(options: {
  sandbox: Awaited<ReturnType<typeof ensureSandbox>>
  repoPath: string
  files: string[]
}) {
  if (options.files.length === 0) {
    return {}
  }

  const command = `cd ${quoteShell(options.repoPath)} && wc -c ${options.files
    .map((file) => quoteShell(file))
    .join(' ')}`
  const result = await options.sandbox.process.executeCommand(
    command,
    undefined,
    undefined,
    20,
  )

  if (result.exitCode !== 0) {
    return {}
  }

  const sizes: Record<string, number> = {}
  for (const rawLine of result.result.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }

    const match = line.match(/^(\d+)\s+(.+)$/)
    if (!match) {
      continue
    }

    const [, sizeText, fileName] = match
    if (options.files.includes(fileName)) {
      sizes[fileName] = Number(sizeText)
    }
  }

  return sizes
}

async function buildRunValidationEvent(options: {
  sandbox: Awaited<ReturnType<typeof ensureSandbox>>
  repoPath: string
  run: RunRecord
  workspace: ReadyWorkspaceRecord
  existingEvents: PersistedRunEvent[]
  synced: Pick<SyncedRunLogs, 'events' | 'previewPort' | 'status'>
}) {
  const finalStatus = options.synced.status ?? options.run.status
  if (!['idle', 'error'].includes(finalStatus)) {
    return null
  }

  const git = await getRepoGitState({
    sandbox: options.sandbox,
    repoPath: options.repoPath,
  })
  const changedFiles = git.fileStatus.map((file) => file.name)
  const fileSizes = await readChangedFileSizes({
    sandbox: options.sandbox,
    repoPath: options.repoPath,
    files: changedFiles.slice(0, 8),
  })
  const mergedEvents = [...options.existingEvents, ...options.synced.events]
  const assistantTextLength = collectAssistantTextLength(mergedEvents)
  const toolActivityCount = mergedEvents.filter(
    (event) => event.type === 'tool_call' || event.type === 'tool_result',
  ).length
  const previewPort =
    options.synced.previewPort ??
    options.run.previewPort ??
    options.workspace.previewPort ??
    null
  const hasPreview = previewPort != null
  const hasRepoChanges = changedFiles.length > 0
  const docsOnlyChanges =
    hasRepoChanges &&
    changedFiles.every((file) => file.startsWith('docs/') || file.endsWith('.md'))
  const tinyChangedFiles = changedFiles.filter((file) => (fileSizes[file] ?? Infinity) < 300)
  const allSizedFilesAreTiny =
    hasRepoChanges &&
    changedFiles.length === Object.keys(fileSizes).length &&
    tinyChangedFiles.length === changedFiles.length

  let type: RunValidationEventType = 'validation_summary'
  let content = ''

  if (finalStatus === 'error') {
    type = 'validation_warning'
    if (hasPreview || hasRepoChanges) {
      content = `Run ended with an error after producing output (${hasPreview ? `preview :${previewPort}` : 'no preview'}, ${hasRepoChanges ? summarizeChangedFiles(changedFiles) : 'no repo changes'}). Review the result before relying on it.`
    } else {
      content =
        'Run ended with an error and no meaningful preview, repo changes, or substantive assistant response were detected.'
    }
  } else if (options.run.agentSlug === 'frontend') {
    if (hasPreview) {
      content = `Validated output: preview detected on :${previewPort}${hasRepoChanges ? ` with repo changes in ${summarizeChangedFiles(changedFiles)}.` : '.'}`
    } else if (hasRepoChanges) {
      content = `Validated output: detected repo changes in ${summarizeChangedFiles(changedFiles)}.`
    } else if (assistantTextLength >= 240) {
      content =
        'Validated output: no repo changes were detected, but the agent produced a substantive repository-grounded response.'
    } else {
      type = 'validation_warning'
      content =
        'Needs review: the frontend run stopped without a preview URL, repo changes, or a substantive assistant response.'
    }
  } else {
    if (hasRepoChanges && docsOnlyChanges && allSizedFilesAreTiny) {
      type = 'validation_warning'
      content = `Needs review: the docs run only produced very small markdown changes (${summarizeChangedFiles(tinyChangedFiles)}) that may be placeholders.`
    } else if (hasRepoChanges) {
      content = `Validated output: detected documentation changes in ${summarizeChangedFiles(changedFiles)}.`
    } else if (assistantTextLength >= 240) {
      content =
        'Validated output: no files changed, but the docs agent produced a substantive repository-grounded response.'
    } else {
      type = 'validation_warning'
      content =
        'Needs review: the docs run stopped without documentation changes or a substantive assistant response.'
    }
  }

  return {
    type,
    content,
    createdAt: Date.now(),
    raw: {
      agentSlug: options.run.agentSlug,
      status: finalStatus,
      previewPort,
      changedFiles,
      fileSizes,
      assistantTextLength,
      toolActivityCount,
    },
  } satisfies RunValidationEvent
}

function getWorkspacePreviewUrlPattern(repoPath: string) {
  return `${repoPath}:<port>`
}

function requireWorkspaceRepoPath(workspace: WorkspaceRecord) {
  if (!workspace.repoPath) {
    throw new Error(`Workspace ${workspace._id} does not have a repository path yet`)
  }

  return workspace.repoPath
}

async function ensureWorkspaceSandboxAndRepo(options: {
  convex: Awaited<ReturnType<typeof createServerConvexClient>>
  workspace: WorkspaceRecord
  githubAccessToken?: string
  syncPiAssets?: boolean
}) {
  const repoPath = options.workspace.repoPath ?? getRemoteRepoPath(options.workspace.repoFullName)
  const sandbox = await ensureSandbox({
    ownerId: options.workspace.ownerId,
    workspaceId: String(options.workspace._id),
    repoFullName: options.workspace.repoFullName,
    existingSandboxId: options.workspace.sandboxId,
  })

  const sandboxWasRecovered = options.workspace.sandboxId !== sandbox.id
  if (options.syncPiAssets || sandboxWasRecovered) {
    await uploadBuddyPiAssets(sandbox)
  }
  await ensureRepoClone({
    sandbox,
    repoPath,
    cloneUrl: options.workspace.cloneUrl,
    branch: options.workspace.branch,
    accessToken: options.githubAccessToken,
  })

  let workspace = options.workspace
  const previewUrlPattern = getWorkspacePreviewUrlPattern(repoPath)
  if (
    workspace.sandboxId !== sandbox.id ||
    workspace.sandboxName !== sandbox.name ||
    workspace.repoPath !== repoPath ||
    workspace.previewUrlPattern !== previewUrlPattern ||
    workspace.status !== 'ready'
  ) {
    const repairedWorkspace = await options.convex.mutation(
      convexApi.buddypie.finalizeWorkspaceImport,
      {
        workspaceId: workspace._id,
        requesterId: workspace.ownerId,
        sandboxId: sandbox.id,
        sandboxName: sandbox.name,
        repoPath,
        branch: workspace.branch,
        previewUrlPattern,
      },
    )

    if (repairedWorkspace) {
      workspace = repairedWorkspace
    }
  }

  const readyWorkspace: ReadyWorkspaceRecord = {
    ...workspace,
    repoPath: requireWorkspaceRepoPath(workspace),
  }

  return {
    workspace: readyWorkspace,
    sandbox,
  }
}

async function isRunTransportUsable(options: {
  sandbox: Awaited<ReturnType<typeof ensureSandbox>>
  run: RunRecord
}) {
  if (!options.run.sandboxSessionId || !options.run.commandId) {
    return false
  }

  try {
    const command = await options.sandbox.process.getSessionCommand(
      options.run.sandboxSessionId,
      options.run.commandId,
    )

    return command.exitCode == null
  } catch (error) {
    if (isDaytonaNotFoundError(error)) {
      return false
    }

    throw error
  }
}

async function relaunchRunTransport(options: {
  convex: Awaited<ReturnType<typeof createServerConvexClient>>
  sandbox: Awaited<ReturnType<typeof ensureSandbox>>
  workspace: ReadyWorkspaceRecord
  run: RunRecord
}) {
  await uploadBuddyPiAssets(options.sandbox)
  const started = await resumePiRun({
    sandbox: options.sandbox,
    runId: String(options.run._id),
    workspaceId: String(options.workspace._id),
    agentSlug: options.run.agentSlug as AgentSlug,
    repoPath: options.workspace.repoPath,
    provider: options.run.providerId,
    model: options.run.modelId,
    sandboxSessionId: options.run.sandboxSessionId ?? `buddypie-${options.run._id}`,
  })

  await options.convex.mutation(convexApi.buddypie.updateRunTransport, {
    runId: options.run._id,
    requesterId: options.run.ownerId,
    status: 'idle',
    sandboxSessionId: started.sandboxSessionId,
    commandId: started.commandId,
    logOffset: 0,
    lastEventAt: Date.now(),
  })

  return started
}

async function getWorkspaceRuntimeContext(options: {
  workspaceId: Id<'workspaces'>
  requesterId: string
  githubAccessToken?: string
}) {
  const convex = await createServerConvexClient()
  const workspace = await convex.query(convexApi.buddypie.workspaceForServer, {
    workspaceId: options.workspaceId,
    requesterId: options.requesterId,
  })

  if (!workspace) {
    throw new Error('Workspace not found')
  }

  const runtime = await ensureWorkspaceSandboxAndRepo({
    convex,
    workspace,
    githubAccessToken: options.githubAccessToken,
  })

  return {
    convex,
    workspace: runtime.workspace,
    sandbox: runtime.sandbox,
  }
}

async function persistWorkspaceGitMetadata(options: {
  convex: Awaited<ReturnType<typeof createServerConvexClient>>
  workspaceId: Id<'workspaces'>
  requesterId: string
  git: Awaited<ReturnType<typeof getRepoGitState>>
  lastCommitSha?: string
  lastPullRequestUrl?: string
}) {
  return options.convex.mutation(convexApi.buddypie.recordWorkspaceGitMetadata, {
    workspaceId: options.workspaceId,
    requesterId: options.requesterId,
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
  const convex = await createServerConvexClient()
  await convex.mutation(convexApi.buddypie.seedAgentProfiles, {})

  const parsedRepo = parseGitHubRepoInput(options.repoInput)
  const repoFullName = `${parsedRepo.repoOwner}/${parsedRepo.repoName}`
  const repo = await fetchGitHubRepo(repoFullName, options.githubAccessToken)

  const prepared = await convex.mutation(convexApi.buddypie.prepareWorkspaceImport, {
    ownerId: options.ownerId,
    requesterId: options.ownerId,
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

  try {
    const runtime = await ensureWorkspaceSandboxAndRepo({
      convex,
      workspace,
      githubAccessToken: options.githubAccessToken,
    })
    const git = await getRepoGitState({
      sandbox: runtime.sandbox,
      repoPath: runtime.workspace.repoPath,
    })

    return await persistWorkspaceGitMetadata({
      convex,
      workspaceId: prepared.workspaceId,
      requesterId: options.ownerId,
      git,
    })
  } catch (error) {
    await convex.mutation(convexApi.buddypie.failWorkspaceImport, {
      workspaceId: prepared.workspaceId,
      requesterId: options.ownerId,
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
    githubAccessToken: options.githubAccessToken,
  })
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
    requesterId: options.requesterId,
    branch: git.currentBranch,
    status: 'ready',
  })

  return await persistWorkspaceGitMetadata({
    convex,
    workspaceId: options.workspaceId,
    requesterId: options.requesterId,
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
  githubAccessToken?: string
}) {
  const prepared = await prepareWorkspaceRunStart(options)
  return startPreparedWorkspaceRun({
    prepared,
    paymentReceipt: options.paymentReceipt,
    payerWallet: options.payerWallet,
  })
}

async function getRunContext(options: {
  convex: Awaited<ReturnType<typeof createServerConvexClient>>
  runId: Id<'runs'>
  requesterId: string
}) {
  return options.convex.query(convexApi.buddypie.runForServer, {
    runId: options.runId,
    requesterId: options.requesterId,
  })
}

export type PreparedWorkspaceRunStart = {
  convex: Awaited<ReturnType<typeof createServerConvexClient>>
  workspace: NonNullable<Awaited<ReturnType<typeof getRunContext>>>['workspace']
  runId: Id<'runs'>
  requesterId: string
  agentSlug: AgentSlug
  prompt: string
  providerId?: string
  modelId?: string
  agentProfile: ReturnType<typeof getAgentProfile>
  created: boolean
  runContext: NonNullable<Awaited<ReturnType<typeof getRunContext>>>
  githubAccessToken?: string
}

export async function prepareWorkspaceRunStart(options: {
  workspaceId: Id<'workspaces'>
  requesterId: string
  agentSlug: AgentSlug
  prompt: string
  paymentReceipt?: unknown
  payerWallet?: string
  githubAccessToken?: string
}) {
  const convex = await createServerConvexClient()
  const workspace = await convex.query(convexApi.buddypie.workspaceForServer, {
    workspaceId: options.workspaceId,
    requesterId: options.requesterId,
  })

  if (!workspace) {
    throw new Error('Workspace not found')
  }

  const runtime = await ensureWorkspaceSandboxAndRepo({
    convex,
    workspace,
    githubAccessToken: options.githubAccessToken,
  })
  const readyWorkspace = runtime.workspace

  const agentConfig = await convex.query(convexApi.buddypie.agentRunConfig, {
    agentSlug: options.agentSlug,
  })
  const agentProfile = agentConfig?.profile ?? getAgentProfile(options.agentSlug)
  const providerId = agentConfig?.defaultModelConfig?.providerId
  const modelId = agentConfig?.defaultModelConfig?.modelId
  const preparedRun = await convex.mutation(convexApi.buddypie.prepareRun, {
    ownerId: readyWorkspace.ownerId,
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

  const runContext = await getRunContext({
    convex,
    runId: preparedRun.runId,
    requesterId: options.requesterId,
  })

  if (!runContext) {
    throw new Error('Run record was not created')
  }

  return {
    convex,
    workspace: readyWorkspace,
    runId: preparedRun.runId,
    requesterId: options.requesterId,
    agentSlug: options.agentSlug,
    prompt: options.prompt,
    providerId,
    modelId,
    agentProfile,
    created: preparedRun.created,
    runContext,
    githubAccessToken: options.githubAccessToken,
  } satisfies PreparedWorkspaceRunStart
}

export async function cancelPreparedWorkspaceRun(options: {
  prepared: PreparedWorkspaceRunStart
}) {
  if (!options.prepared.created) {
    return
  }

  await options.prepared.convex.mutation(convexApi.buddypie.updateRunTransport, {
    runId: options.prepared.runId,
    requesterId: options.prepared.requesterId,
    status: 'error',
    endedAt: Date.now(),
    lastEventAt: Date.now(),
  })
}

export async function startPreparedWorkspaceRun(options: {
  prepared: PreparedWorkspaceRunStart
  paymentReceipt?: unknown
  payerWallet?: string
  settlement?: unknown
}) {
  if (!options.prepared.created) {
    return options.prepared.runContext
  }

  const {
    prepared: { convex, workspace, runId, requesterId, agentSlug, prompt, providerId, modelId, agentProfile },
  } = options

  if (options.paymentReceipt) {
    await convex.mutation(convexApi.buddypie.recordPayment, {
      ownerId: workspace.ownerId,
      workspaceId: workspace._id,
      runId,
      agentSlug,
      status: 'settled',
      walletAddress: options.payerWallet,
      chain: agentProfile.chain,
      network: agentProfile.chain,
      amountUsd: agentProfile.priceUsd,
      priceLabel: agentProfile.priceLabel,
      receipt: options.paymentReceipt,
      settlement: options.settlement,
    })
  }

  try {
    const runtime = await ensureWorkspaceSandboxAndRepo({
      convex,
      workspace,
      githubAccessToken: options.prepared.githubAccessToken,
      syncPiAssets: true,
    })

    const started = await startPiRun({
      sandbox: runtime.sandbox,
      runId: String(runId),
      workspaceId: String(runtime.workspace._id),
      agentSlug,
      repoPath: runtime.workspace.repoPath,
      repoFullName: runtime.workspace.repoFullName,
      prompt,
      provider: providerId,
      model: modelId,
    })

    await convex.mutation(convexApi.buddypie.updateRunTransport, {
      runId,
      requesterId,
      status: 'active',
      sandboxSessionId: started.sandboxSessionId,
      commandId: started.commandId,
      paymentReceipt: options.paymentReceipt,
      payerWallet: options.payerWallet,
      lastPrompt: prompt,
      lastEventAt: Date.now(),
    })

    await convex.mutation(convexApi.buddypie.applyRunLogSync, {
      runId,
      requesterId,
      logOffset: 0,
      events: [
        {
          type: 'user_message',
          role: 'user',
          content: prompt,
          createdAt: Date.now(),
        },
        createValidationPendingEvent(agentSlug),
      ],
    })
  } catch (error) {
    await convex.mutation(convexApi.buddypie.updateRunTransport, {
      runId,
      requesterId,
      status: 'error',
      paymentReceipt: options.paymentReceipt,
      payerWallet: options.payerWallet,
      lastPrompt: prompt,
      lastEventAt: Date.now(),
      endedAt: Date.now(),
    })
    throw error
  }

  await new Promise((resolve) => setTimeout(resolve, 1200))
  await refreshRun({
    runId,
    requesterId,
    githubAccessToken: options.prepared.githubAccessToken,
  })

  return await getRunContext({
    convex,
    runId,
    requesterId,
  })
}

export async function postRunMessage(options: {
  runId: Id<'runs'>
  requesterId: string
  prompt: string
  githubAccessToken?: string
}) {
  const convex = await createServerConvexClient()
  const context = await convex.query(convexApi.buddypie.runForServer, {
    runId: options.runId,
    requesterId: options.requesterId,
  })

  if (!context) {
    throw new Error('Run not found')
  }

  const { run, workspace } = context
  const runtime = await ensureWorkspaceSandboxAndRepo({
    convex,
    workspace,
    githubAccessToken: options.githubAccessToken,
  })
  let sandboxSessionId = run.sandboxSessionId ?? `buddypie-${run._id}`
  let commandId = run.commandId
  let logOffset = run.logOffset ?? 0

  if (!(await isRunTransportUsable({ sandbox: runtime.sandbox, run }))) {
    const relaunched = await relaunchRunTransport({
      convex,
      sandbox: runtime.sandbox,
      workspace: runtime.workspace,
      run,
    })
    sandboxSessionId = relaunched.sandboxSessionId
    commandId = relaunched.commandId
    logOffset = 0
  }

  await sendRunMessage({
    sandbox: runtime.sandbox,
    sandboxSessionId,
    commandId: commandId!,
    agentSlug: run.agentSlug as AgentSlug,
    repoFullName: runtime.workspace.repoFullName,
    repoPath: runtime.workspace.repoPath,
    prompt: options.prompt,
    asFollowUp: true,
  })

  await convex.mutation(convexApi.buddypie.updateRunTransport, {
    runId: options.runId,
    requesterId: options.requesterId,
    status: 'active',
    sandboxSessionId,
    commandId,
    lastPrompt: options.prompt,
    lastEventAt: Date.now(),
  })

  await convex.mutation(convexApi.buddypie.applyRunLogSync, {
    runId: options.runId,
    requesterId: options.requesterId,
    logOffset,
    events: [
      {
        type: 'user_message',
        role: 'user',
        content: options.prompt,
        createdAt: Date.now(),
      },
      createValidationPendingEvent(run.agentSlug as AgentSlug),
    ],
  })

  await new Promise((resolve) => setTimeout(resolve, 800))
  await refreshRun({
    runId: options.runId,
    requesterId: options.requesterId,
    githubAccessToken: options.githubAccessToken,
  })

  return await convex.query(convexApi.buddypie.runForServer, {
    runId: options.runId,
    requesterId: options.requesterId,
  })
}

export async function refreshRun(options: {
  runId: Id<'runs'>
  requesterId: string
  githubAccessToken?: string
}) {
  const convex = await createServerConvexClient()
  const context = await convex.query(convexApi.buddypie.runForServer, {
    runId: options.runId,
    requesterId: options.requesterId,
  })

  if (!context) {
    throw new Error('Run not found')
  }

  const { run, workspace } = context
  if (!run.sandboxSessionId || !run.commandId) {
    return context
  }

  const runtime = await ensureWorkspaceSandboxAndRepo({
    convex,
    workspace,
    githubAccessToken: options.githubAccessToken,
  })
  let synced: SyncedRunLogs

  try {
    synced = await syncRunLogs({
      sandbox: runtime.sandbox,
      sandboxSessionId: run.sandboxSessionId,
      commandId: run.commandId,
      previousOffset: run.logOffset,
    })
  } catch (error) {
    if (!isDaytonaNotFoundError(error)) {
      throw error
    }

    const existingEvents = await convex.query(convexApi.buddypie.runEventsForServer, {
      runId: options.runId,
      requesterId: options.requesterId,
    })
    const validationEvent = await buildRunValidationEvent({
      sandbox: runtime.sandbox,
      repoPath: runtime.workspace.repoPath,
      run,
      workspace: runtime.workspace,
      existingEvents,
      synced: {
        events: [],
        previewPort: run.previewPort,
        status: 'idle',
      },
    })
    const latestValidation = latestValidationEvent(existingEvents)
    const validationEvents =
      validationEvent &&
      (!latestValidation ||
        latestValidation.type !== validationEvent.type ||
        latestValidation.content !== validationEvent.content)
        ? [validationEvent]
        : []

    await convex.mutation(convexApi.buddypie.applyRunLogSync, {
      runId: options.runId,
      requesterId: options.requesterId,
      logOffset: run.logOffset ?? 0,
      status: 'idle',
      previewPort: run.previewPort,
      events: validationEvents,
    })

    return await convex.query(convexApi.buddypie.runForServer, {
      runId: options.runId,
      requesterId: options.requesterId,
    })
  }

  const nextStatus = synced.status ?? run.status
  let validationEvents: RunValidationEvent[] = []

  if (nextStatus === 'idle' || nextStatus === 'error') {
    const existingEvents = await convex.query(convexApi.buddypie.runEventsForServer, {
      runId: options.runId,
      requesterId: options.requesterId,
    })
    const validationEvent = await buildRunValidationEvent({
      sandbox: runtime.sandbox,
      repoPath: runtime.workspace.repoPath,
      run,
      workspace: runtime.workspace,
      existingEvents,
      synced,
    })
    const latestValidation = latestValidationEvent(existingEvents)
    if (
      validationEvent &&
      (!latestValidation ||
        latestValidation.type !== validationEvent.type ||
        latestValidation.content !== validationEvent.content)
    ) {
      validationEvents = [validationEvent]
    }
  }

  await convex.mutation(convexApi.buddypie.applyRunLogSync, {
    runId: options.runId,
    requesterId: options.requesterId,
    logOffset: synced.logOffset,
    status: nextStatus,
    previewPort: synced.previewPort,
    events: [...synced.events, ...validationEvents],
  })

  return await convex.query(convexApi.buddypie.runForServer, {
    runId: options.runId,
    requesterId: options.requesterId,
  })
}

export async function abortRun(options: {
  runId: Id<'runs'>
  requesterId: string
  githubAccessToken?: string
}) {
  const convex = await createServerConvexClient()
  const context = await convex.query(convexApi.buddypie.runForServer, {
    runId: options.runId,
    requesterId: options.requesterId,
  })

  if (!context) {
    throw new Error('Run not found')
  }

  const { run, workspace } = context
  if (run.sandboxSessionId && run.commandId) {
    const runtime = await ensureWorkspaceSandboxAndRepo({
      convex,
      workspace,
      githubAccessToken: options.githubAccessToken,
    })

    if (await isRunTransportUsable({ sandbox: runtime.sandbox, run })) {
      await abortPiRun({
        sandbox: runtime.sandbox,
        sandboxSessionId: run.sandboxSessionId,
        commandId: run.commandId,
      })
    }
  }

  return convex.mutation(convexApi.buddypie.markRunAborted, {
    runId: options.runId,
    requesterId: options.requesterId,
  })
}

export async function getPreviewLink(options: {
  workspaceId: Id<'workspaces'>
  requesterId: string
  githubAccessToken?: string
}) {
  const { workspace, sandbox } = await getWorkspaceRuntimeContext(options)

  if (!workspace.previewPort) {
    return {
      url: null,
      port: workspace.previewPort ?? null,
    }
  }

  const signed = await getSignedPreviewUrl(sandbox, workspace.previewPort)

  return {
    url: signed.url,
    port: workspace.previewPort,
  }
}

export async function getWorkspaceGitStatus(options: {
  workspaceId: Id<'workspaces'>
  requesterId: string
  githubAccessToken?: string
}) {
  const { convex, workspace, sandbox } = await getWorkspaceRuntimeContext(options)
  const git = await getRepoGitState({
    sandbox,
    repoPath: workspace.repoPath,
  })
  const updatedWorkspace = await persistWorkspaceGitMetadata({
    convex,
    workspaceId: options.workspaceId,
    requesterId: options.requesterId,
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
  githubAccessToken?: string
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
    requesterId: options.requesterId,
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
  githubAccessToken?: string
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
    requesterId: options.requesterId,
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
    requesterId: options.requesterId,
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
    requesterId: options.requesterId,
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
  const prepared = await preparePublicWorkspaceRunStart(options)
  return startPreparedWorkspaceRun({
    prepared,
    paymentReceipt: options.paymentReceipt,
    payerWallet: options.payerWallet,
  })
}

export async function preparePublicWorkspaceRunStart(options: {
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

  return prepareWorkspaceRunStart({
    workspaceId: workspace._id,
    requesterId: PLATFORM_OWNER_ID,
    agentSlug: options.agentSlug,
    prompt: options.prompt,
    paymentReceipt: options.paymentReceipt,
    payerWallet: options.payerWallet,
  })
}
