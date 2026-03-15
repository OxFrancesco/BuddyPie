import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Daytona } from '@daytonaio/sdk'
import { execFileSync } from 'node:child_process'
import { loadProjectEnv } from './_shared/project-env'
import {
  createRepoBranch,
  ensureRepoClone,
  getRepoGitState,
  getSignedPreviewUrl,
  hasPiProviderCredentials,
  pushRepoChanges,
  sendRunMessage,
  startPiRun,
  syncRunLogs,
  uploadBuddyPiAssets,
  commitRepoChanges,
} from '../src/lib/daytona'
import {
  BUDDYPIE_SNAPSHOT_NAME,
  ensureBuddyPieSnapshot,
  verifyBuddyPieSnapshot,
} from '../src/lib/daytona-snapshot'
import { getRemoteRepoPath } from '../src/lib/pi'
import { createGitHubPullRequest, fetchGitHubRepo } from '../src/lib/github'

loadProjectEnv()

type StepResult = {
  name: string
  status: 'passed' | 'failed' | 'skipped'
  details?: Record<string, unknown>
}

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function hasFlag(args: string[], flag: string) {
  return args.includes(flag)
}

function readStringFlag(args: string[], name: string, fallback: string | null = null) {
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

function normalizeRepoInput(input: string) {
  const trimmed = input.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const url = new URL(trimmed)
    const [owner, repoNameRaw] = url.pathname.replace(/^\/+/, '').split('/')
    if (!owner || !repoNameRaw) {
      throw new Error(`Invalid GitHub repo URL: ${input}`)
    }

    return {
      repoFullName: `${owner}/${repoNameRaw.replace(/\.git$/, '')}`,
      cloneUrl: trimmed.endsWith('.git') ? trimmed : `${trimmed.replace(/\/+$/, '')}.git`,
    }
  }

  if (!trimmed.includes('/')) {
    throw new Error(`Expected owner/repo or GitHub URL, received: ${input}`)
  }

  const [owner, repoNameRaw] = trimmed.split('/')
  const repoName = repoNameRaw.replace(/\.git$/, '')
  return {
    repoFullName: `${owner}/${repoName}`,
    cloneUrl: `https://github.com/${owner}/${repoName}.git`,
  }
}

function quoteShell(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function tryGetGitHubToken() {
  for (const envName of ['BUDDYPIE_E2E_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN']) {
    if (process.env[envName]) {
      return process.env[envName]!
    }
  }

  try {
    return execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

function tryGetOriginRepo() {
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()

    if (!remote) {
      return null
    }

    return normalizeRepoInput(remote)
  } catch {
    return null
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchPreview(url: string) {
  const response = await fetch(url)
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    body: await response.text(),
  }
}

async function main() {
  const args = process.argv.slice(2)
  const replaceSnapshot = hasFlag(args, '--replace-snapshot')
  const keepSandbox = hasFlag(args, '--keep-sandbox')
  const skipPr = hasFlag(args, '--skip-pr')
  const skipPi = hasFlag(args, '--skip-pi')
  const piProvider =
    readStringFlag(args, '--pi-provider', process.env.BUDDYPIE_E2E_PI_PROVIDER ?? 'zai') ?? 'zai'
  const piModel =
    readStringFlag(args, '--pi-model', process.env.BUDDYPIE_E2E_PI_MODEL ?? 'glm-4.7') ?? 'glm-4.7'
  const snapshotName =
    readStringFlag(args, '--snapshot', process.env.DAYTONA_SNAPSHOT ?? BUDDYPIE_SNAPSHOT_NAME) ??
    BUDDYPIE_SNAPSHOT_NAME

  const repoFromFlag = readStringFlag(args, '--repo')
  const repo = repoFromFlag
    ? normalizeRepoInput(repoFromFlag)
    : process.env.BUDDYPIE_E2E_GITHUB_REPO
      ? normalizeRepoInput(process.env.BUDDYPIE_E2E_GITHUB_REPO)
      : tryGetOriginRepo()

  if (!repo) {
    throw new Error(
      'Unable to resolve an E2E GitHub repo. Pass --repo owner/repo or set BUDDYPIE_E2E_GITHUB_REPO.',
    )
  }

  const githubToken = tryGetGitHubToken()
  const timestamp = Date.now()
  const repoPath = getRemoteRepoPath(repo.repoFullName)
  const branchName = `codex/e2e-${timestamp}`
  const reportDir = path.resolve(process.cwd(), 'artifacts')
  const reportPath = path.join(reportDir, `daytona-e2e-${timestamp}.json`)
  const results: StepResult[] = []

  const daytona = new Daytona({
    apiKey: requireEnv('DAYTONA_API_KEY'),
    apiUrl: process.env.DAYTONA_API_URL,
    target: process.env.DAYTONA_TARGET,
  })

  const report = {
    snapshotName,
    repo: repo.repoFullName,
    branchName,
    piProvider,
    piModel,
    startedAt: new Date().toISOString(),
    sandboxId: null as string | null,
    previewUrl: null as string | null,
    pullRequestUrl: null as string | null,
    results,
  }

  const snapshot = await ensureBuddyPieSnapshot(daytona, {
    name: snapshotName,
    replaceExisting: replaceSnapshot,
    activate: true,
    onLogs: (chunk) => process.stdout.write(chunk),
  })
  results.push({
    name: 'snapshot',
    status: 'passed',
    details: {
      name: snapshot.snapshot.name,
      created: snapshot.created,
    },
  })

  const snapshotVerification = await verifyBuddyPieSnapshot(daytona, {
    name: snapshot.snapshot.name,
  })
  results.push({
    name: 'snapshot-verification',
    status: 'passed',
    details: snapshotVerification,
  })

  const sandbox = await daytona.create(
    {
      snapshot: snapshot.snapshot.name,
      name: `buddypie-e2e-${timestamp}`,
      public: false,
      autoStopInterval: 30,
      autoArchiveInterval: 60,
      autoDeleteInterval: 0,
      ephemeral: true,
      labels: {
        app: 'buddypie',
        purpose: 'e2e',
        repo: repo.repoFullName.replace(/\//g, '--').toLowerCase(),
      },
    },
    { timeout: 180 },
  )
  report.sandboxId = sandbox.id

  try {
    await sandbox.start(60)
    await uploadBuddyPiAssets(sandbox)
    const repoMeta = await fetchGitHubRepo(repo.repoFullName, githubToken ?? undefined)
    await ensureRepoClone({
      sandbox,
      repoPath,
      cloneUrl: repo.cloneUrl,
      branch: repoMeta.defaultBranch,
      accessToken: githubToken ?? undefined,
    })

    const initialGit = await getRepoGitState({
      sandbox,
      repoPath,
    })
    results.push({
      name: 'clone',
      status: 'passed',
      details: initialGit,
    })

    const manualPreviewPort = 4173
    const manualPreviewSessionId = `preview-${timestamp}`
    await sandbox.process.createSession(manualPreviewSessionId)
    const manualPreviewCommand = await sandbox.process.executeSessionCommand(
      manualPreviewSessionId,
      {
        command: `cd ${repoPath} && python3 -m http.server ${manualPreviewPort} --bind 0.0.0.0`,
        runAsync: true,
      },
      30,
    )

    if (!manualPreviewCommand.cmdId) {
      throw new Error('Failed to start the manual preview server in Daytona.')
    }

    const manualPreviewUrl = await getSignedPreviewUrl(sandbox, manualPreviewPort)
    report.previewUrl = manualPreviewUrl.url

    let manualPreviewFetch = null as Awaited<ReturnType<typeof fetchPreview>> | null
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await sleep(2_000)
      try {
        manualPreviewFetch = await fetchPreview(manualPreviewUrl.url)
      } catch {
        continue
      }

      if (manualPreviewFetch.status >= 200 && manualPreviewFetch.status < 400) {
        break
      }
    }

    const manualPreviewPassed =
      manualPreviewFetch !== null &&
      manualPreviewFetch.status >= 200 &&
      manualPreviewFetch.status < 400

    results.push({
      name: 'manual-preview',
      status: manualPreviewPassed ? 'passed' : 'failed',
      details: {
        previewPort: manualPreviewPort,
        previewUrl: manualPreviewUrl.url,
        status: manualPreviewFetch?.status ?? null,
        contentType: manualPreviewFetch?.contentType ?? null,
        bodySample: manualPreviewFetch?.body.slice(0, 200) ?? null,
      },
    })

    if (!manualPreviewPassed) {
      throw new Error('Manual preview verification failed.')
    }

    await createRepoBranch({
      sandbox,
      repoPath,
      branchName,
    })

    const markerPath = `${repoPath}/.buddypie-e2e-${timestamp}.md`
    await sandbox.fs.uploadFile(
      Buffer.from(`# BuddyPie E2E\n\nCreated at ${new Date(timestamp).toISOString()}\n`, 'utf8'),
      markerPath,
    )

    const committed = await commitRepoChanges({
      sandbox,
      repoPath,
      files: [path.posix.basename(markerPath)],
      message: `test: verify BuddyPie Daytona workflow ${timestamp}`,
      author: 'BuddyPie E2E',
      email: 'e2e@buddypie.dev',
    })
    results.push({
      name: 'commit',
      status: 'passed',
      details: {
        commitSha: committed.commitSha,
        git: committed.git,
      },
    })

    const canRunPi = !skipPi && hasPiProviderCredentials(piProvider)

    if (canRunPi) {
      const expectedDocsFiles = ['docs/daytona-e2e.md', 'docs/pi-runtime.md']
      const minimumDocBytes = 300
      const docsPrompt = [
        'Do not edit any existing files.',
        'Inspect the checked out repository before writing docs so the content matches the current codebase.',
        'Focus on how BuddyPie uses Daytona sandboxes and PI RPC runs.',
        'Create the `docs` directory if needed and add exactly these new markdown files:',
        `- ${expectedDocsFiles[0]}: explain how \`scripts/daytona-e2e.ts\` provisions a Daytona sandbox, verifies preview, runs the docs agent, and records results.`,
        `- ${expectedDocsFiles[1]}: explain how \`src/lib/daytona.ts\`, \`src/lib/pi.ts\`, and \`src/lib/pi-provider-catalog.ts\` launch PI RPC runs, pass provider/model settings, and attach BuddyPie skills/extensions.`,
        'Requirements:',
        '- Base the content on code you read in this repository, not assumptions.',
        '- Mention concrete file paths, function names, and CLI flags where relevant.',
        `- Each file must be substantive (roughly ${minimumDocBytes}+ characters).`,
        '- Only create those two files under `docs/`.',
        'Stop when both files are written.',
      ].join('\n')
      const docsRun = await startPiRun({
        sandbox,
        runId: `e2e-docs-${timestamp}`,
        workspaceId: `e2e-${timestamp}`,
        agentSlug: 'docs',
        repoPath,
        repoFullName: repo.repoFullName,
        provider: piProvider,
        model: piModel,
        prompt: docsPrompt,
      })

      let docsPreviousOffset = 0
      let docsStatus: 'active' | 'idle' | 'error' | undefined
      let docsCommandExitCode: number | null | undefined
      let docsPromptRetried = false
      let docsFileSizes: Record<string, number> = {}
      let docsGit = await getRepoGitState({
        sandbox,
        repoPath,
      })
      const matchesExpectedDoc = (candidate: string, expected: string) =>
        candidate === expected || candidate.endsWith(`/${expected}`)
      const hasExpectedDocs = (git: typeof docsGit) =>
        expectedDocsFiles.every((expected) =>
          git.fileStatus.some((file) => matchesExpectedDoc(file.name, expected)),
        )
      let docsEdited = hasExpectedDocs(docsGit)

      const pollDocsRun = async (attempts: number) => {
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          if (docsEdited && (docsStatus === 'idle' || docsCommandExitCode != null)) {
            break
          }

          await sleep(3_000)
          const [synced, command, git] = await Promise.all([
            syncRunLogs({
              sandbox,
              sandboxSessionId: docsRun.sandboxSessionId,
              commandId: docsRun.commandId,
              previousOffset: docsPreviousOffset,
            }),
            sandbox.process.getSessionCommand(docsRun.sandboxSessionId, docsRun.commandId),
            getRepoGitState({
              sandbox,
              repoPath,
            }),
          ])

          docsPreviousOffset = synced.logOffset
          docsStatus = synced.status ?? docsStatus
          docsCommandExitCode = command.exitCode
          docsGit = git
          docsEdited = hasExpectedDocs(docsGit)

          if (docsStatus === 'error') {
            break
          }

          if (!docsEdited && docsCommandExitCode != null && docsStatus !== 'active') {
            break
          }
        }
      }

      await pollDocsRun(80)

      if (!docsEdited && docsStatus == null && docsCommandExitCode == null) {
        await sendRunMessage({
          sandbox,
          sandboxSessionId: docsRun.sandboxSessionId,
          commandId: docsRun.commandId,
          agentSlug: 'docs',
          repoFullName: repo.repoFullName,
          repoPath,
          prompt: docsPrompt,
          asFollowUp: true,
        })
        docsPromptRetried = true
        await pollDocsRun(40)
      }

      if (!docsEdited) {
        const markerExists = await sandbox.process.executeCommand(
          `cd ${quoteShell(repoPath)} && ${expectedDocsFiles
            .map((file) => `test -f ${quoteShell(file)}`)
            .join(' && ')}`,
          undefined,
          undefined,
          20,
        )
        docsEdited = markerExists.exitCode === 0
        if (docsEdited) {
          docsGit = await getRepoGitState({
            sandbox,
            repoPath,
          })
        }
      }

      if (docsEdited) {
        const fileSizeResult = await sandbox.process.executeCommand(
          `cd ${quoteShell(repoPath)} && wc -c ${expectedDocsFiles
            .map((file) => quoteShell(file))
            .join(' ')}`,
          undefined,
          undefined,
          20,
        )

        if (fileSizeResult.exitCode === 0) {
          for (const rawLine of fileSizeResult.result.split(/\r?\n/)) {
            const line = rawLine.trim()
            if (!line) {
              continue
            }

            const match = line.match(/^(\d+)\s+(.+)$/)
            if (!match) {
              continue
            }

            const [, sizeText, fileName] = match
            if (expectedDocsFiles.includes(fileName)) {
              docsFileSizes[fileName] = Number(sizeText)
            }
          }
        }
      }

      const docsSizePassed = expectedDocsFiles.every(
        (file) => (docsFileSizes[file] ?? 0) >= minimumDocBytes,
      )
      const docsStepPassed = docsEdited && docsStatus !== 'error' && docsSizePassed
      const docsLogs = await sandbox.process.getSessionCommandLogs(
        docsRun.sandboxSessionId,
        docsRun.commandId,
      )
      const docsLogText = `${docsLogs.stdout ?? ''}${docsLogs.stderr ?? ''}`

      results.push({
        name: 'pi-docs-edit',
        status: docsStepPassed ? 'passed' : 'failed',
        details: {
          expectedDocsFiles,
          sandboxSessionId: docsRun.sandboxSessionId,
          commandId: docsRun.commandId,
          status: docsStatus ?? 'unknown',
          commandExitCode: docsCommandExitCode ?? null,
          promptRetried: docsPromptRetried,
          fileSizes: docsFileSizes,
          logTail: docsLogText.slice(-4_000) || null,
          git: docsGit,
        },
      })

      if (!docsStepPassed) {
        throw new Error('PI docs agent did not produce the expected repository edit.')
      }

      const docsCommit = await commitRepoChanges({
        sandbox,
        repoPath,
        files: expectedDocsFiles,
        message: `docs: verify PI docs workflow ${timestamp}`,
        author: 'BuddyPie E2E',
        email: 'e2e@buddypie.dev',
      })
      results.push({
        name: 'commit-pi-docs',
        status: 'passed',
        details: {
          commitSha: docsCommit.commitSha,
          git: docsCommit.git,
        },
      })

      const run = await startPiRun({
        sandbox,
        runId: `e2e-preview-${timestamp}`,
        workspaceId: `e2e-${timestamp}`,
        agentSlug: 'frontend',
        repoPath,
        repoFullName: repo.repoFullName,
        provider: piProvider,
        model: piModel,
        prompt:
          'Do not edit any files. From the repository root, use the bash tool to run exactly `python3 -m http.server 4273 --bind 0.0.0.0 >/tmp/buddypie-e2e-preview.log 2>&1 &` and then run `curl -I http://127.0.0.1:4273`. Keep the server running, do not choose any other port, and only after curl succeeds explicitly mention http://127.0.0.1:4273.',
      })

      let previousOffset = 0
      let previewPort: number | undefined

      for (let attempt = 0; attempt < 40; attempt += 1) {
        await sleep(3_000)
        const synced = await syncRunLogs({
          sandbox,
          sandboxSessionId: run.sandboxSessionId,
          commandId: run.commandId,
          previousOffset,
        })
        previousOffset = synced.logOffset
        previewPort = synced.previewPort ?? previewPort
        if (previewPort) {
          break
        }
      }

      if (!previewPort) {
        throw new Error('PI run did not surface a preview port within the timeout window.')
      }

      let internalPreviewReady = false
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await sleep(2_000)
        const healthcheck = await sandbox.process.executeCommand(
          `curl -fsS http://127.0.0.1:${previewPort} >/dev/null`,
          undefined,
          undefined,
          20,
        )
        if (healthcheck.exitCode === 0) {
          internalPreviewReady = true
          break
        }
      }

      const signedPreview = await getSignedPreviewUrl(sandbox, previewPort)
      report.previewUrl = signedPreview.url

      let previewFetch = null as Awaited<ReturnType<typeof fetchPreview>> | null
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await sleep(2_000)
        try {
          previewFetch = await fetchPreview(signedPreview.url)
        } catch {
          continue
        }

        if (previewFetch.status >= 200 && previewFetch.status < 400) {
          break
        }
      }

      const previewPassed =
        previewFetch !== null && previewFetch.status >= 200 && previewFetch.status < 400

      results.push({
        name: 'pi-preview',
        status: previewPassed ? 'passed' : 'failed',
        details: {
          previewPort,
          internalPreviewReady,
          previewUrl: signedPreview.url,
          status: previewFetch?.status ?? null,
          contentType: previewFetch?.contentType ?? null,
          bodySample: previewFetch?.body.slice(0, 200) ?? null,
        },
      })

      if (!previewPassed || !internalPreviewReady) {
        throw new Error('Preview verification failed after PI reported a preview port.')
      }
    } else if (skipPi) {
      results.push({
        name: 'pi-docs-edit',
        status: 'skipped',
        details: {
          reason: 'Skipped by --skip-pi',
        },
      })
      results.push({
        name: 'commit-pi-docs',
        status: 'skipped',
        details: {
          reason: 'Skipped by --skip-pi',
        },
      })
      results.push({
        name: 'pi-preview',
        status: 'skipped',
        details: {
          reason: 'Skipped by --skip-pi',
        },
      })
    } else {
      const reason = `Missing credentials for PI provider ${piProvider}.`
      results.push({
        name: 'pi-docs-edit',
        status: 'skipped',
        details: { reason },
      })
      results.push({
        name: 'commit-pi-docs',
        status: 'skipped',
        details: { reason },
      })
      results.push({
        name: 'pi-preview',
        status: 'skipped',
        details: { reason },
      })
    }

    if (githubToken) {
      const pushed = await pushRepoChanges({
        sandbox,
        repoPath,
        accessToken: githubToken,
      })
      results.push({
        name: 'push',
        status: 'passed',
        details: pushed,
      })

      if (!skipPr) {
        const pullRequest = await createGitHubPullRequest({
          repoFullName: repo.repoFullName,
          accessToken: githubToken,
          title: `[E2E] Verify BuddyPie Daytona workflow ${timestamp}`,
          body: 'Automated BuddyPie Daytona E2E verification branch (includes PI docs-agent edit + preview checks).',
          head: branchName,
          base: repoMeta.defaultBranch,
          draft: true,
        })
        report.pullRequestUrl = pullRequest.url
        results.push({
          name: 'pull-request',
          status: 'passed',
          details: pullRequest,
        })
      } else {
        results.push({
          name: 'pull-request',
          status: 'skipped',
          details: {
            reason: 'Skipped by --skip-pr',
          },
        })
      }
    } else {
      results.push({
        name: 'push',
        status: 'skipped',
        details: {
          reason:
            'No GitHub token was available. Set BUDDYPIE_E2E_GITHUB_TOKEN or authenticate gh for push/PR verification.',
        },
      })
      results.push({
        name: 'pull-request',
        status: 'skipped',
        details: {
          reason:
            'No GitHub token was available. Set BUDDYPIE_E2E_GITHUB_TOKEN or authenticate gh for push/PR verification.',
        },
      })
    }
  } catch (error) {
    results.push({
      name: 'e2e',
      status: 'failed',
      details: {
        message: error instanceof Error ? error.message : String(error),
      },
    })
    throw error
  } finally {
    await mkdir(reportDir, { recursive: true })
    await writeFile(reportPath, JSON.stringify(report, null, 2))
    if (!keepSandbox) {
      await sandbox.delete()
    }
  }

  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
