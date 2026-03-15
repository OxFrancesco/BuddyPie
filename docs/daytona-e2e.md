# Daytona E2E Testing

The `scripts/daytona-e2e.ts` script provides end-to-end verification of BuddyPie's Daytona sandbox integration, including preview server provisioning, PI agent execution, and optional GitHub pull request creation.

## Execution Flow

### 1. Sandbox Provisioning

The script instantiates a Daytona client using the `DAYTONA_API_KEY` environment variable:

```typescript
const daytona = new Daytona({
  apiKey: requireEnv('DAYTONA_API_KEY'),
  apiUrl: process.env.DAYTONA_API_URL,
  target: process.env.DAYTONA_TARGET,
})
```

It then ensures a BuddyPie snapshot exists via `ensureBuddyPieSnapshot()` from `src/lib/daytona-snapshot.ts`, optionally replacing an existing snapshot with the `--replace-snapshot` flag. Snapshot verification follows via `verifyBuddyPieSnapshot()`.

### 2. Sandbox Creation

A new sandbox is created from the snapshot:

```typescript
const sandbox = await daytona.create({
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
}, { timeout: 180 })
```

The sandbox is started with `sandbox.start(60)` and BuddyPie assets are uploaded via `uploadBuddyPiAssets(sandbox)`.

### 3. Repository Clone

The target GitHub repository is cloned using `ensureRepoClone()` from `src/lib/daytona.ts`:

```typescript
await ensureRepoClone({
  sandbox,
  repoPath,
  cloneUrl: repo.cloneUrl,
  branch: repoMeta.defaultBranch,
  accessToken: githubToken ?? undefined,
})
```

The initial git state is captured via `getRepoGitState()` for reporting.

### 4. Manual Preview Verification

A manual preview server is started on port 4173 using Python's HTTP server:

```typescript
const manualPreviewCommand = await sandbox.process.executeSessionCommand(
  manualPreviewSessionId,
  {
    command: `cd ${repoPath} && python3 -m http.server ${manualPreviewPort} --bind 0.0.0.0`,
    runAsync: true,
  },
  30,
)
```

A signed preview URL is obtained via `getSignedPreviewUrl(sandbox, manualPreviewPort)`, and the script polls the URL for up to 15 attempts (2-second intervals) to verify the server responds with a 2xx-3xx status.

### 5. Git Operations and PR Creation

A branch is created with `createRepoBranch()`, a marker file is committed via `commitRepoChanges()`, and changes are pushed with `pushRepoChanges()`. If a GitHub token is available, a draft PR is created using `createGitHubPullRequest()` from `src/lib/github.ts`.

### 6. PI Agent Execution

Unless `--skip-pi` is passed, the script launches a PI agent run via `startPiRun()` from `src/lib/daytona.ts`:

```typescript
const run = await startPiRun({
  sandbox,
  runId: `e2e-${timestamp}`,
  workspaceId: `e2e-${timestamp}`,
  agentSlug: 'frontend',
  repoPath,
  repoFullName: repo.repoFullName,
  prompt: 'Do not edit any files...',
})
```

The script polls logs via `syncRunLogs()` for up to 40 attempts (3-second intervals) to detect a preview port mentioned by the agent. Once found, internal health checks run, and a signed preview URL is verified.

## CLI Flags

| Flag | Description |
|------|-------------|
| `--replace-snapshot` | Force recreation of the BuddyPie snapshot |
| `--keep-sandbox` | Preserve the sandbox after test completion |
| `--skip-pr` | Skip GitHub pull request creation |
| `--skip-pi` | Skip PI agent execution |
| `--snapshot <name>` | Use a specific snapshot name (default: `BUDDYPIE_SNAPSHOT_NAME`) |
| `--repo <owner/repo>` | Target repository (default: origin or `BUDDYPIE_E2E_GITHUB_REPO`) |

## Output

Results are written to `artifacts/daytona-e2e-{timestamp}.json` containing:
- Snapshot name and creation status
- Repository and branch information
- Sandbox ID
- Preview URLs (manual and PI-generated)
- Pull request URL (if created)
- Step-by-step results with status (`passed`/`failed`/`skipped`) and details
