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
import { getServerEnv, requireDaytonaApiKey } from './server-env'

let cachedDaytona: Daytona | null = null

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

export async function startPiRun(options: {
  sandbox: Sandbox
  runId: string
  workspaceId: string
  agentSlug: AgentSlug
  repoPath: string
  repoFullName: string
  prompt: string
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
        provider: env.piProvider,
        model: env.piModel,
        command: env.piCommand,
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
