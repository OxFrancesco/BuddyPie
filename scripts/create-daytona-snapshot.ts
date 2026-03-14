import { Daytona } from '@daytonaio/sdk'
import { loadProjectEnv } from './_shared/project-env'
import {
  BUDDYPIE_SNAPSHOT_BASE_IMAGE,
  BUDDYPIE_SNAPSHOT_NAME,
  BUDDYPIE_SNAPSHOT_RESOURCES,
  ensureBuddyPieSnapshot,
  verifyBuddyPieSnapshot,
} from '../src/lib/daytona-snapshot'

loadProjectEnv()

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function readNumberFlag(args: string[], name: string, fallback: number) {
  const index = args.indexOf(name)
  if (index === -1) {
    return fallback
  }

  const rawValue = args[index + 1]
  const parsed = Number(rawValue)
  if (!rawValue || Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive number after ${name}`)
  }

  return parsed
}

function readStringFlag(args: string[], name: string, fallback: string) {
  const index = args.indexOf(name)
  if (index === -1) {
    return fallback
  }

  const value = args[index + 1]
  if (!value) {
    throw new Error(`Expected a value after ${name}`)
  }

  return value
}

async function main() {
  const args = process.argv.slice(2)
  const name = readStringFlag(args, '--name', process.env.DAYTONA_SNAPSHOT ?? BUDDYPIE_SNAPSHOT_NAME)
  const baseImage = readStringFlag(args, '--image', BUDDYPIE_SNAPSHOT_BASE_IMAGE)
  const replaceExisting = args.includes('--replace')
  const verify = args.includes('--verify')

  const resources = {
    cpu: readNumberFlag(args, '--cpu', BUDDYPIE_SNAPSHOT_RESOURCES.cpu ?? 2),
    memory: readNumberFlag(args, '--memory', BUDDYPIE_SNAPSHOT_RESOURCES.memory ?? 4),
    disk: readNumberFlag(args, '--disk', BUDDYPIE_SNAPSHOT_RESOURCES.disk ?? 10),
  }

  const daytona = new Daytona({
    apiKey: requireEnv('DAYTONA_API_KEY'),
    apiUrl: process.env.DAYTONA_API_URL,
    target: process.env.DAYTONA_TARGET,
  })

  const { snapshot, created } = await ensureBuddyPieSnapshot(daytona, {
    name,
    baseImage,
    resources,
    replaceExisting,
    activate: true,
    onLogs: (chunk) => process.stdout.write(chunk),
  })

  console.log(`\nSnapshot ${snapshot.name} ${created ? 'created' : 'reused'} and activated.`)

  if (!verify) {
    return
  }

  const verification = await verifyBuddyPieSnapshot(daytona, {
    name: snapshot.name,
  })
  console.log(JSON.stringify(verification, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
