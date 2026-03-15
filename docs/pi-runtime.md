# PI RPC Runtime

BuddyPie launches PI coding agents as RPC processes inside Daytona sandboxes, using `src/lib/daytona.ts`, `src/lib/pi.ts`, and `src/lib/pi-provider-catalog.ts` to configure provider credentials, attach skills and extensions, and stream agent output.

## Launching a PI Run

The `startPiRun()` function in `src/lib/daytona.ts` orchestrates agent startup:

```typescript
const run = await startPiRun({
  sandbox,
  runId: `e2e-${timestamp}`,
  workspaceId: `e2e-${timestamp}`,
  agentSlug: 'frontend',
  repoPath,
  repoFullName: repo.repoFullName,
  prompt: 'Do not edit any files...',
  provider?: string,
  model?: string,
})
```

### Session Setup

A unique sandbox session ID is generated (`buddypie-{runId}`), and a session directory is created at:

```
{BUDDYPIE_REMOTE_PI_SESSIONS_DIR}/{workspaceId}/{agentSlug}
```

Where `BUDDYPIE_REMOTE_PI_SESSIONS_DIR` is `/home/daytona/.buddypie/sessions` from `src/lib/buddypie-config.ts`.

### Command Construction

The `buildPiRpcCommand()` function in `src/lib/pi.ts` constructs the shell command:

```typescript
cd '/home/daytona/repos/{repoPath}' && \
{ENV_VARS} \
pi --mode rpc --no-skills --no-extensions \
  --session-dir '/home/daytona/.buddypie/sessions/{workspaceId}/{agentSlug}' \
  --provider '{provider}' \
  --model '{model}' \
  --skill '/home/daytona/.buddypie/skills/{skillSetId}/SKILL.md' \
  --extension '/home/daytona/.buddypie/extensions/{extensionName}.ts'
```

Skills and extensions are attached per agent profile via `getRemoteAgentSkillPaths()` and `getRemoteAgentExtensionPaths()`:

- **Skills**: Resolved from `src/lib/buddypie-config.ts` agent profiles (e.g., `common`, `docs`)
- **Extensions**: Always include `repo-safety.ts` and `preview-detector.ts`; agent-specific extensions include `frontend-hints.ts` (frontend) or `docs-hints.ts` (docs)

### Prompt Injection

After starting the command, the agent prompt is sent via RPC stdin:

```typescript
await sandbox.process.sendSessionCommandInput(
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
```

The `buildAgentPrompt()` function wraps the user prompt with runtime context:
- Repository full name
- Working directory path
- Agent profile hint (from `getAgentProfile()`)
- Persistence warning for git operations

## Provider and Model Configuration

### Provider Credentials

`src/lib/pi-provider-catalog.ts` defines supported providers and their credential environment variables. The `PI_RUNTIME_ENV_NAMES` array lists all recognized credential env vars, including:

- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`
- `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_BASE_URL`
- `ZAI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`
- AWS Bedrock credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, etc.)

The `hasPiProviderCredentialsFromEnv()` function checks whether credentials exist for a given provider:

```typescript
export function hasPiProviderCredentialsFromEnv(
  providerId?: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  // Special handling for google-vertex, azure-openai-responses, amazon-bedrock
  // Falls back to checking expected env names from PI_PROVIDER_CREDENTIAL_ENV_MAP
}
```

### Environment Injection

`getPiRuntimeEnv()` from `src/lib/daytona.ts` collects all `PI_RUNTIME_ENV_NAMES` present in `process.env` and passes them to the PI command:

```typescript
export function getPiRuntimeEnv() {
  return Object.fromEntries(
    PI_RUNTIME_ENV_NAMES.flatMap((name) =>
      process.env[name] ? [[name, process.env[name]!]] : [],
    ),
  )
}
```

### Model Catalog

The `DEFAULT_PROVIDER_MODELS` and `EXTRA_ZAI_MODELS` arrays define available provider/model combinations, each with:
- `providerId` and `modelId` for PI invocation
- `providerLabel` and `modelLabel` for UI display
- `authType` (`apiKey` or `cloud`)
- `baseUrl` for custom endpoints (e.g., ZAI)
- `supportsReasoning` and `supportsImages` flags

## Log Streaming and Output Parsing

The `syncRunLogs()` function fetches incremental output from the sandbox session:

```typescript
const logs = await sandbox.process.getSessionCommandLogs(
  sandboxSessionId,
  commandId,
)

const output = logs.output ?? `${logs.stdout ?? ''}${logs.stderr ?? ''}`
const newChunk = output.slice(previousOffset)
const parsed = parsePiRpcOutput(newChunk)
```

`parsePiRpcOutput()` in `src/lib/pi.ts` parses JSON-RPC events and plain text, extracting:
- `agent_start` / `agent_end` events with status
- `message_update` events with `assistant_delta` text chunks
- `tool_call` and `tool_result` events
- `error` events
- Preview ports detected via regex matching `\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(?<port>\d{2,5})\b`

## Preview URL Generation

When a preview port is detected, `getSignedPreviewUrl()` from `src/lib/daytona.ts` creates a time-limited access URL:

```typescript
const signedPreview = await sandbox.getSignedPreviewUrl(port, 900)
```

The 900-second TTL allows external verification of agent-spawned preview servers.
