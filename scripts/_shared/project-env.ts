import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const LOADED_MARKER = Symbol.for('buddypie.projectEnvLoaded')

function parseEnvAssignment(line: string) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) {
    return null
  }

  const exportPrefix = trimmed.startsWith('export ') ? 'export ' : ''
  const assignment = exportPrefix ? trimmed.slice(exportPrefix.length) : trimmed
  const separatorIndex = assignment.indexOf('=')
  if (separatorIndex <= 0) {
    return null
  }

  const key = assignment.slice(0, separatorIndex).trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null
  }

  let value = assignment.slice(separatorIndex + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }

  return {
    key,
    value: value.replace(/\\n/g, '\n'),
  }
}

export function loadProjectEnv(cwd = process.cwd()) {
  const globalState = globalThis as typeof globalThis & {
    [LOADED_MARKER]?: boolean
  }
  if (globalState[LOADED_MARKER]) {
    return
  }

  for (const fileName of ['.env.local', '.env']) {
    const filePath = path.join(cwd, fileName)
    if (!existsSync(filePath)) {
      continue
    }

    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const assignment = parseEnvAssignment(line)
      if (!assignment) {
        continue
      }

      if (process.env[assignment.key] === undefined) {
        process.env[assignment.key] = assignment.value
      }
    }
  }

  globalState[LOADED_MARKER] = true
}
