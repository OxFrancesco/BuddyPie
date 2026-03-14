import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { Daytona, type Sandbox } from '@daytonaio/sdk'
import {
  BUDDYPIE_REMOTE_PI_ASSETS_DIR,
  BUDDYPIE_REMOTE_PI_SESSIONS_DIR,
  DAYTONA_HOME_DIR,
  type AgentSlug,
  repoSlug,
} from './buddypie-config'
import { sleep, toErrorMessage } from './http'
import {
  buildAgentPrompt,
  buildPiRpcCommand,
  createRpcAbort,
  createRpcPrompt,
  getRemotePiSessionDir,
  LOCAL_PI_ASSETS_DIR,
  parsePiRpcOutput,
} from './pi'
import { formatMissingBuddyPieSnapshotError } from './daytona-snapshot'
import {
  PI_RUNTIME_ENV_NAMES,
  hasPiProviderCredentialsFromEnv,
} from './pi-provider-catalog'
import { getServerEnv, requireDaytonaApiKey } from './server-env'

let cachedDaytona: Daytona | null = null

export type WorkspaceGitFileState = {
  name: string
  staging: string
  worktree: string
  extra: string
}

export type WorkspaceGitState = {
  currentBranch: string
  ahead: number
  behind: number
  branchPublished: boolean
  dirty: boolean
  branches: string[]
  fileStatus: WorkspaceGitFileState[]
}

export function getDaytonaClient() {
  if (cachedDaytona) {
    return cachedDaytona
  }

  const env = getServerEnv()
  cachedDaytona = new Daytona({
    apiKey: requireDaytonaApiKey(),
    apiUrl: env.daytonaApiUrl,
    target: env.daytonaTarget,
  })
  return cachedDaytona
}

export function buildWorkspaceLabels(options: {
  ownerId: string
  workspaceId: string
  repoFullName: string
}) {
  return {
    app: 'buddypie',
    ownerId: options.ownerId,
    workspaceId: options.workspaceId,
    repo: repoSlug(options.repoFullName),
  }
}

export function getPiRuntimeEnv() {
  return Object.fromEntries(
    PI_RUNTIME_ENV_NAMES.flatMap((name) =>
      process.env[name] ? [[name, process.env[name]!]] : [],
    ),
  )
}

export function hasPiProviderCredentials(provider?: string) {
  return hasPiProviderCredentialsFromEnv(provider, process.env)
}

async function ensureFolder(sandbox: Sandbox, remotePath: string) {
  try {
    await sandbox.fs.createFolder(remotePath, '755')
  } catch {
    // Folder already exists in the common case.
  }
}

async function listLocalFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true })
  const results: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await listLocalFiles(fullPath)))
      continue
    }

    results.push(fullPath)
  }

  return results
}

export async function uploadBuddyPiAssets(sandbox: Sandbox) {
  const localFiles = await listLocalFiles(LOCAL_PI_ASSETS_DIR)

  await ensureFolder(sandbox, BUDDYPIE_REMOTE_PI_ASSETS_DIR)
  await ensureFolder(sandbox, `${BUDDYPIE_REMOTE_PI_ASSETS_DIR}/skills`)
  await ensureFolder(sandbox, `${BUDDYPIE_REMOTE_PI_ASSETS_DIR}/extensions`)
  await ensureFolder(sandbox, `${BUDDYPIE_REMOTE_PI_SESSIONS_DIR}`)

  for (const localFile of localFiles) {
    const relativePath = path.relative(LOCAL_PI_ASSETS_DIR, localFile)
    const remoteFile = path.posix.join(
      BUDDYPIE_REMOTE_PI_ASSETS_DIR,
      relativePath.split(path.sep).join('/'),
    )
    const remoteDir = path.posix.dirname(remoteFile)
    await ensureFolder(sandbox, remoteDir)
    await sandbox.fs.uploadFile(localFile, remoteFile)
  }
}

export async function ensureSandbox(options: {
  ownerId: string
  workspaceId: string
  repoFullName: string
  existingSandboxId?: string
}) {
  const daytona = getDaytonaClient()
  const env = getServerEnv()

  if (options.existingSandboxId) {
    const existing = await daytona.get(options.existingSandboxId)
    await existing.start(60)
    return existing
  }

  try {
    await daytona.snapshot.get(env.daytonaSnapshot)
  } catch {
    throw new Error(formatMissingBuddyPieSnapshotError(env.daytonaSnapshot))
  }

  const sandbox = await daytona.create(
    {
      snapshot: env.daytonaSnapshot,
      name: `buddypie-${repoSlug(options.repoFullName)}`,
      public: false,
      autoStopInterval: 30,
      autoArchiveInterval: 10080,
      autoDeleteInterval: -1,
      labels: buildWorkspaceLabels({
        ownerId: options.ownerId,
        workspaceId: options.workspaceId,
        repoFullName: options.repoFullName,
      }),
    },
    { timeout: 90 },
  )

  await sandbox.start(60)
  await uploadBuddyPiAssets(sandbox)
  return sandbox
}

export async function ensureRepoClone(options: {
  sandbox: Sandbox
  repoPath: string
  cloneUrl: string
  branch: string
  accessToken?: string
}) {
  try {
    await options.sandbox.fs.getFileDetails(options.repoPath)
    return
  } catch {
    await ensureFolder(options.sandbox, path.posix.dirname(options.repoPath))
  }

  await options.sandbox.git.clone(
    options.cloneUrl,
    options.repoPath,
    options.branch,
    undefined,
    options.accessToken ? 'x-access-token' : undefined,
    options.accessToken,
  )
}

export async function syncRepoClone(options: {
  sandbox: Sandbox
  repoPath: string
  accessToken?: string
}) {
  await options.sandbox.git.pull(
    options.repoPath,
    options.accessToken ? 'x-access-token' : undefined,
    options.accessToken,
  )
}

function normalizeGitBranchName(value: string) {
  const sanitized = value
    .trim()
    .replace(/^refs\/heads\//, '')
    .replace(/^origin\//, '')
    .replace(/\s+/g, '-')

  if (!sanitized) {
    throw new Error('Branch name cannot be empty')
  }

  return sanitized.startsWith('codex/') ? sanitized : `codex/${sanitized}`
}

export async function getRepoGitState(options: {
  sandbox: Sandbox
  repoPath: string
}) {
  const [status, branches] = await Promise.all([
    options.sandbox.git.status(options.repoPath),
    options.sandbox.git.branches(options.repoPath),
  ])

  return {
    currentBranch: status.currentBranch,
    ahead: status.ahead ?? 0,
    behind: status.behind ?? 0,
    branchPublished: Boolean(status.branchPublished),
    dirty: status.fileStatus.length > 0,
    branches: branches.branches,
    fileStatus: status.fileStatus.map((file) => ({
      name: file.name,
      staging: String(file.staging),
      worktree: String(file.worktree),
      extra: file.extra,
    })),
  } satisfies WorkspaceGitState
}

export async function createRepoBranch(options: {
  sandbox: Sandbox
  repoPath: string
  branchName: string
  checkout?: boolean
}) {
  const branchName = normalizeGitBranchName(options.branchName)
  const existingBranches = await options.sandbox.git.branches(options.repoPath)

  if (!existingBranches.branches.includes(branchName)) {
    await options.sandbox.git.createBranch(options.repoPath, branchName)
  }

  if (options.checkout !== false) {
    await options.sandbox.git.checkoutBranch(options.repoPath, branchName)
  }

  return {
    branchName,
    git: await getRepoGitState({
      sandbox: options.sandbox,
      repoPath: options.repoPath,
    }),
  }
}

export async function commitRepoChanges(options: {
  sandbox: Sandbox
  repoPath: string
  files: string[]
  message: string
  author: string
  email: string
  allowEmpty?: boolean
}) {
  if (options.files.length === 0) {
    throw new Error('No files were selected for commit')
  }

  await options.sandbox.git.add(options.repoPath, options.files)
  const commit = await options.sandbox.git.commit(
    options.repoPath,
    options.message,
    options.author,
    options.email,
    options.allowEmpty,
  )

  return {
    commitSha: commit.sha,
    git: await getRepoGitState({
      sandbox: options.sandbox,
      repoPath: options.repoPath,
    }),
  }
}

export async function pushRepoChanges(options: {
  sandbox: Sandbox
  repoPath: string
  accessToken?: string
}) {
  await options.sandbox.git.push(
    options.repoPath,
    options.accessToken ? 'x-access-token' : undefined,
    options.accessToken,
  )

  return getRepoGitState({
    sandbox: options.sandbox,
    repoPath: options.repoPath,
  })
}

export async function startPiRun(options: {
  sandbox: Sandbox
  runId: string
  workspaceId: string
  agentSlug: AgentSlug
  repoPath: string
  repoFullName: string
  prompt: string
  provider?: string
  model?: string
}) {
  const env = getServerEnv()
  const sandboxSessionId = `buddypie-${options.runId}`
  const sessionDir = getRemotePiSessionDir(options.workspaceId, options.agentSlug)

  await ensureFolder(options.sandbox, BUDDYPIE_REMOTE_PI_SESSIONS_DIR)
  await ensureFolder(
    options.sandbox,
    `${BUDDYPIE_REMOTE_PI_SESSIONS_DIR}/${options.workspaceId}`,
  )
  await ensureFolder(options.sandbox, sessionDir)
  await options.sandbox.process.createSession(sandboxSessionId)

  const startResponse = await options.sandbox.process.executeSessionCommand(
    sandboxSessionId,
    {
      command: buildPiRpcCommand({
        agentSlug: options.agentSlug,
        repoPath: options.repoPath,
        sessionDir,
        provider: options.provider ?? env.piProvider,
        model: options.model ?? env.piModel,
        command: env.piCommand,
        envVars: getPiRuntimeEnv(),
      }),
      runAsync: true,
      suppressInputEcho: true,
    },
    30,
  )

  if (!startResponse.cmdId) {
    throw new Error('Daytona did not return a PI command id')
  }

  await sleep(750)
  await options.sandbox.process.sendSessionCommandInput(
    sandboxSessionId,
    startResponse.cmdId,
    `${createRpcPrompt(
      buildAgentPrompt({
        agentSlug: options.agentSlug,
        repoFullName: options.repoFullName,
        repoPath: options.repoPath,
        prompt: options.prompt,
      }),
    )}\n`,
  )

  return {
    sandboxSessionId,
    commandId: startResponse.cmdId,
    sessionPath: sessionDir,
  }
}

export async function sendRunMessage(options: {
  sandbox: Sandbox
  sandboxSessionId: string
  commandId: string
  agentSlug: AgentSlug
  repoFullName: string
  repoPath: string
  prompt: string
  asFollowUp?: boolean
}) {
  await options.sandbox.process.sendSessionCommandInput(
    options.sandboxSessionId,
    options.commandId,
    `${createRpcPrompt(
      buildAgentPrompt({
        agentSlug: options.agentSlug,
        repoFullName: options.repoFullName,
        repoPath: options.repoPath,
        prompt: options.prompt,
      }),
      options.asFollowUp ? 'followUp' : undefined,
    )}\n`,
  )
}

export async function abortPiRun(options: {
  sandbox: Sandbox
  sandboxSessionId: string
  commandId: string
}) {
  await options.sandbox.process.sendSessionCommandInput(
    options.sandboxSessionId,
    options.commandId,
    `${createRpcAbort()}\n`,
  )
}

export async function syncRunLogs(options: {
  sandbox: Sandbox
  sandboxSessionId: string
  commandId: string
  previousOffset?: number
}) {
  const logs = await options.sandbox.process.getSessionCommandLogs(
    options.sandboxSessionId,
    options.commandId,
  )

  const output = logs.output ?? `${logs.stdout ?? ''}${logs.stderr ?? ''}`
  const previousOffset = options.previousOffset ?? 0
  const newChunk = output.slice(previousOffset)
  const parsed = parsePiRpcOutput(newChunk)

  return {
    ...parsed,
    logOffset: output.length,
  }
}

export async function getSignedPreviewUrl(sandbox: Sandbox, port: number) {
  return sandbox.getSignedPreviewUrl(port, 900)
}

export async function recoverableDaytonaError(error: unknown) {
  const message = toErrorMessage(error)
  if (message.includes('not found')) {
    return {
      retryable: false,
      message,
    }
  }

  return {
    retryable: true,
    message,
  }
}

export async function getSandboxHomeDir(sandbox: Sandbox) {
  return (await sandbox.getUserHomeDir()) ?? DAYTONA_HOME_DIR
}
