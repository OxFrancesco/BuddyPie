import { Daytona, Image, type Resources } from '@daytonaio/sdk'

type DaytonaSnapshot = Awaited<ReturnType<Daytona['snapshot']['get']>>

export const BUDDYPIE_SNAPSHOT_NAME = 'buddypie-pi-base-v2'
export const BUDDYPIE_SNAPSHOT_BASE_IMAGE = 'node:20-bookworm'
export const BUDDYPIE_SNAPSHOT_RESOURCES: Resources = {
  cpu: 2,
  memory: 4,
  disk: 10,
}
export const BUDDYPIE_PI_PACKAGE = '@mariozechner/pi-coding-agent'

export function buildBuddyPieSnapshotImage(options?: {
  baseImage?: string
  piPackage?: string
}) {
  return Image.base(options?.baseImage ?? BUDDYPIE_SNAPSHOT_BASE_IMAGE)
    .env({
      DEBIAN_FRONTEND: 'noninteractive',
      BUN_INSTALL: '/usr/local/bun',
    })
    .workdir('/home/daytona')
    .runCommands(
      'apt-get update',
      'apt-get install -y --no-install-recommends git curl ca-certificates unzip zip ripgrep python3 build-essential',
      'rm -rf /var/lib/apt/lists/*',
      'corepack enable',
      'if ! command -v pnpm >/dev/null 2>&1; then npm install -g pnpm; fi',
      'mkdir -p /usr/local/bun /home/daytona/.buddypie /home/daytona/workspaces',
      'curl -fsSL https://bun.sh/install | bash',
      'ln -sf /usr/local/bun/bin/bun /usr/local/bin/bun',
      'ln -sf /usr/local/bun/bin/bunx /usr/local/bin/bunx',
      `npm install -g ${options?.piPackage ?? BUDDYPIE_PI_PACKAGE}`,
      'chmod -R 755 /home/daytona',
    )
}

export function getBuddyPieSnapshotSpec(options?: {
  name?: string
  resources?: Resources
  baseImage?: string
  piPackage?: string
}) {
  return {
    name: options?.name ?? BUDDYPIE_SNAPSHOT_NAME,
    resources: options?.resources ?? BUDDYPIE_SNAPSHOT_RESOURCES,
    image: buildBuddyPieSnapshotImage({
      baseImage: options?.baseImage,
      piPackage: options?.piPackage,
    }),
  }
}

export function formatMissingBuddyPieSnapshotError(snapshotName: string) {
  return `Daytona snapshot "${snapshotName}" is unavailable. Run \`bun run snapshot:create\` first or set DAYTONA_SNAPSHOT to an existing snapshot.`
}

async function activateSnapshotIfNeeded(
  daytona: Daytona,
  snapshot: DaytonaSnapshot,
  activate = true,
) {
  if (!activate) {
    return snapshot
  }

  try {
    return await daytona.snapshot.activate(snapshot)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('already active')) {
      throw error
    }
    return snapshot
  }
}

export async function ensureBuddyPieSnapshot(
  daytona: Daytona,
  options?: {
    name?: string
    resources?: Resources
    baseImage?: string
    piPackage?: string
    replaceExisting?: boolean
    activate?: boolean
    timeout?: number
    onLogs?: (chunk: string) => void
  },
) {
  const spec = getBuddyPieSnapshotSpec(options)

  let existing: DaytonaSnapshot | null = null
  try {
    existing = await daytona.snapshot.get(spec.name)
  } catch {
    existing = null
  }

  if (existing && options?.replaceExisting) {
    await daytona.snapshot.delete(existing)
    existing = null
  }

  if (existing) {
    const snapshot = await activateSnapshotIfNeeded(daytona, existing, options?.activate !== false)
    return {
      snapshot,
      created: false,
    }
  }

  let createdSnapshot: DaytonaSnapshot
  try {
    createdSnapshot = await daytona.snapshot.create(
      {
        name: spec.name,
        image: spec.image,
        resources: spec.resources,
      },
      {
        timeout: options?.timeout ?? 1800,
        onLogs: options?.onLogs,
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('already exists')) {
      throw error
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3_000))
      try {
        const snapshot = await daytona.snapshot.get(spec.name)
        return {
          snapshot: await activateSnapshotIfNeeded(
            daytona,
            snapshot,
            options?.activate !== false,
          ),
          created: false,
        }
      } catch {
        // Keep polling until the backend exposes the snapshot or we exhaust retries.
      }
    }

    throw error
  }

  return {
    snapshot: await activateSnapshotIfNeeded(
      daytona,
      createdSnapshot,
      options?.activate !== false,
    ),
    created: true,
  }
}

export async function verifyBuddyPieSnapshot(
  daytona: Daytona,
  options?: {
    name?: string
    keepSandbox?: boolean
  },
) {
  const snapshotName = options?.name ?? BUDDYPIE_SNAPSHOT_NAME
  const sandbox = await daytona.create(
    {
      snapshot: snapshotName,
      name: `buddypie-verify-${Date.now()}`,
      public: false,
      autoStopInterval: 15,
      autoArchiveInterval: 60,
      autoDeleteInterval: 0,
      ephemeral: true,
      labels: {
        app: 'buddypie',
        purpose: 'snapshot-verify',
      },
    },
    { timeout: 180 },
  )

  try {
    await sandbox.start(60)
    const command = [
      'node --version',
      'npm --version',
      'pnpm --version',
      'bun --version',
      'git --version',
      'python3 --version',
      'rg --version | head -n 1',
      'pi --help >/dev/null',
      'echo SNAPSHOT_OK',
    ].join(' && ')

    const result = await sandbox.process.executeCommand(command, undefined, undefined, 180)
    if (result.exitCode !== 0) {
      throw new Error(result.result || 'Snapshot verification failed')
    }

    return {
      sandboxId: sandbox.id,
      output: result.result,
    }
  } finally {
    if (!options?.keepSandbox) {
      await sandbox.delete()
    }
  }
}
