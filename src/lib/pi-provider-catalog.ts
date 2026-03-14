export type BuddyPieAgentModelCatalogEntry = {
  providerId: string
  providerLabel: string
  modelId: string
  modelLabel: string
  enabled?: boolean
  isDefault?: boolean
  authType?: string
  api?: string
  baseUrl?: string
  apiKeyEnvNames?: string[]
  supportsReasoning?: boolean
  supportsImages?: boolean
  notes?: string
}

export const DEFAULT_AGENT_MODEL_SELECTIONS = {
  docs: {
    providerId: 'zai',
    modelId: 'glm-4.7',
  },
} as const

export const PI_RUNTIME_ENV_NAMES = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_ORGANIZATION',
  'OPENAI_PROJECT',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_OAUTH_TOKEN',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_BASE_URL',
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_RESOURCE_NAME',
  'AZURE_OPENAI_API_VERSION',
  'AZURE_OPENAI_DEPLOYMENT_NAME_MAP',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_CLOUD_API_KEY',
  'GOOGLE_CLOUD_PROJECT',
  'GCLOUD_PROJECT',
  'GOOGLE_CLOUD_LOCATION',
  'MISTRAL_API_KEY',
  'GROQ_API_KEY',
  'CEREBRAS_API_KEY',
  'XAI_API_KEY',
  'OPENROUTER_API_KEY',
  'AI_GATEWAY_API_KEY',
  'AI_GATEWAY_BASE_URL',
  'ZAI_API_KEY',
  'HF_TOKEN',
  'OPENCODE_API_KEY',
  'KIMI_API_KEY',
  'MINIMAX_API_KEY',
  'MINIMAX_CN_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'AWS_BEARER_TOKEN_BEDROCK',
  'AWS_ENDPOINT_URL_BEDROCK_RUNTIME',
  'AWS_BEDROCK_SKIP_AUTH',
  'AWS_BEDROCK_FORCE_HTTP1',
] as const

export const PI_PROVIDER_CREDENTIAL_ENV_MAP = {
  anthropic: ['ANTHROPIC_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'],
  'azure-openai-responses': [
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_BASE_URL',
    'AZURE_OPENAI_ENDPOINT',
    'AZURE_OPENAI_RESOURCE_NAME',
  ],
  openai: ['OPENAI_API_KEY'],
  google: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  'google-vertex': [
    'GOOGLE_CLOUD_API_KEY',
    'GOOGLE_CLOUD_PROJECT',
    'GCLOUD_PROJECT',
    'GOOGLE_CLOUD_LOCATION',
  ],
  mistral: ['MISTRAL_API_KEY'],
  groq: ['GROQ_API_KEY'],
  cerebras: ['CEREBRAS_API_KEY'],
  xai: ['XAI_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  'vercel-ai-gateway': ['AI_GATEWAY_API_KEY'],
  zai: ['ZAI_API_KEY'],
  huggingface: ['HF_TOKEN'],
  opencode: ['OPENCODE_API_KEY'],
  'opencode-go': ['OPENCODE_API_KEY'],
  'kimi-coding': ['KIMI_API_KEY'],
  minimax: ['MINIMAX_API_KEY'],
  'minimax-cn': ['MINIMAX_CN_API_KEY'],
  'amazon-bedrock': [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'AWS_REGION',
    'AWS_DEFAULT_REGION',
    'AWS_BEARER_TOKEN_BEDROCK',
  ],
} as const

export function getPiProviderCredentialEnvNames(providerId: string) {
  return [...(PI_PROVIDER_CREDENTIAL_ENV_MAP[providerId as keyof typeof PI_PROVIDER_CREDENTIAL_ENV_MAP] ?? [])]
}

export function hasPiProviderCredentialsFromEnv(
  providerId?: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!providerId) {
    return PI_RUNTIME_ENV_NAMES.some((name) => Boolean(env[name]))
  }

  if (providerId === 'google-vertex') {
    const hasApiKey = Boolean(env.GOOGLE_CLOUD_API_KEY)
    const hasProject = Boolean(env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT)
    const hasLocation = Boolean(env.GOOGLE_CLOUD_LOCATION)
    return hasApiKey && hasProject && hasLocation
  }

  if (providerId === 'azure-openai-responses') {
    const hasApiKey = Boolean(env.AZURE_OPENAI_API_KEY)
    const hasEndpoint = Boolean(
      env.AZURE_OPENAI_BASE_URL ||
        env.AZURE_OPENAI_ENDPOINT ||
        env.AZURE_OPENAI_RESOURCE_NAME,
    )
    return hasApiKey && hasEndpoint
  }

  if (providerId === 'amazon-bedrock') {
    const hasIamKeys = Boolean(env.AWS_ACCESS_KEY_ID) && Boolean(env.AWS_SECRET_ACCESS_KEY)
    return hasIamKeys || Boolean(env.AWS_BEARER_TOKEN_BEDROCK)
  }

  const expectedEnvNames = getPiProviderCredentialEnvNames(providerId)
  if (expectedEnvNames.length === 0) {
    return false
  }

  return expectedEnvNames.some((envName) => Boolean(env[envName]))
}

const DEFAULT_PROVIDER_MODELS: BuddyPieAgentModelCatalogEntry[] = [
  {
    providerId: 'anthropic',
    providerLabel: 'Anthropic',
    modelId: 'claude-opus-4-6',
    modelLabel: 'Claude Opus 4.6',
    authType: 'apiKey',
  },
  {
    providerId: 'openai',
    providerLabel: 'OpenAI',
    modelId: 'gpt-5.4',
    modelLabel: 'GPT-5.4',
    authType: 'apiKey',
  },
  {
    providerId: 'azure-openai-responses',
    providerLabel: 'Azure OpenAI Responses',
    modelId: 'gpt-5.2',
    modelLabel: 'GPT-5.2',
    authType: 'apiKey',
  },
  {
    providerId: 'google',
    providerLabel: 'Google Gemini',
    modelId: 'gemini-2.5-pro',
    modelLabel: 'Gemini 2.5 Pro',
    authType: 'apiKey',
  },
  {
    providerId: 'google-vertex',
    providerLabel: 'Google Vertex AI',
    modelId: 'gemini-3-pro-preview',
    modelLabel: 'Gemini 3 Pro Preview',
    authType: 'cloud',
    notes: 'Requires GOOGLE_CLOUD_API_KEY plus project and location env vars.',
  },
  {
    providerId: 'mistral',
    providerLabel: 'Mistral',
    modelId: 'devstral-medium-latest',
    modelLabel: 'Devstral Medium Latest',
    authType: 'apiKey',
  },
  {
    providerId: 'groq',
    providerLabel: 'Groq',
    modelId: 'openai/gpt-oss-120b',
    modelLabel: 'GPT-OSS 120B',
    authType: 'apiKey',
  },
  {
    providerId: 'cerebras',
    providerLabel: 'Cerebras',
    modelId: 'zai-glm-4.6',
    modelLabel: 'ZAI GLM 4.6',
    authType: 'apiKey',
  },
  {
    providerId: 'xai',
    providerLabel: 'xAI',
    modelId: 'grok-4-fast-non-reasoning',
    modelLabel: 'Grok 4 Fast Non Reasoning',
    authType: 'apiKey',
  },
  {
    providerId: 'openrouter',
    providerLabel: 'OpenRouter',
    modelId: 'openai/gpt-5.1-codex',
    modelLabel: 'OpenAI GPT-5.1 Codex',
    authType: 'apiKey',
  },
  {
    providerId: 'vercel-ai-gateway',
    providerLabel: 'Vercel AI Gateway',
    modelId: 'anthropic/claude-opus-4-6',
    modelLabel: 'Anthropic Claude Opus 4.6',
    authType: 'apiKey',
  },
  {
    providerId: 'zai',
    providerLabel: 'ZAI',
    modelId: 'glm-4.6',
    modelLabel: 'GLM-4.6',
    authType: 'apiKey',
    api: 'openai-completions',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    supportsReasoning: true,
  },
  {
    providerId: 'huggingface',
    providerLabel: 'Hugging Face',
    modelId: 'moonshotai/Kimi-K2.5',
    modelLabel: 'Kimi K2.5',
    authType: 'apiKey',
  },
  {
    providerId: 'opencode',
    providerLabel: 'OpenCode Zen',
    modelId: 'claude-opus-4-6',
    modelLabel: 'Claude Opus 4.6',
    authType: 'apiKey',
  },
  {
    providerId: 'opencode-go',
    providerLabel: 'OpenCode Go',
    modelId: 'kimi-k2.5',
    modelLabel: 'Kimi K2.5',
    authType: 'apiKey',
  },
  {
    providerId: 'kimi-coding',
    providerLabel: 'Kimi Coding',
    modelId: 'kimi-k2-thinking',
    modelLabel: 'Kimi K2 Thinking',
    authType: 'apiKey',
  },
  {
    providerId: 'minimax',
    providerLabel: 'MiniMax',
    modelId: 'MiniMax-M2.1',
    modelLabel: 'MiniMax M2.1',
    authType: 'apiKey',
  },
  {
    providerId: 'minimax-cn',
    providerLabel: 'MiniMax China',
    modelId: 'MiniMax-M2.1',
    modelLabel: 'MiniMax M2.1',
    authType: 'apiKey',
  },
  {
    providerId: 'amazon-bedrock',
    providerLabel: 'Amazon Bedrock',
    modelId: 'us.anthropic.claude-opus-4-6-v1',
    modelLabel: 'Anthropic Claude Opus 4.6',
    authType: 'cloud',
    notes: 'Use IAM credentials or AWS_BEARER_TOKEN_BEDROCK in the BuddyPie environment.',
  },
]

const EXTRA_ZAI_MODELS: BuddyPieAgentModelCatalogEntry[] = [
  {
    providerId: 'zai',
    providerLabel: 'ZAI',
    modelId: 'glm-4.5',
    modelLabel: 'GLM-4.5',
    authType: 'apiKey',
    api: 'openai-completions',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    supportsReasoning: true,
  },
  {
    providerId: 'zai',
    providerLabel: 'ZAI',
    modelId: 'glm-4.5-air',
    modelLabel: 'GLM-4.5-Air',
    authType: 'apiKey',
    api: 'openai-completions',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    supportsReasoning: true,
  },
  {
    providerId: 'zai',
    providerLabel: 'ZAI',
    modelId: 'glm-4.5-flash',
    modelLabel: 'GLM-4.5-Flash',
    authType: 'apiKey',
    api: 'openai-completions',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    supportsReasoning: true,
  },
  {
    providerId: 'zai',
    providerLabel: 'ZAI',
    modelId: 'glm-4.5v',
    modelLabel: 'GLM-4.5V',
    authType: 'apiKey',
    api: 'openai-completions',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    supportsReasoning: true,
    supportsImages: true,
  },
  {
    providerId: 'zai',
    providerLabel: 'ZAI',
    modelId: 'glm-4.6v',
    modelLabel: 'GLM-4.6V',
    authType: 'apiKey',
    api: 'openai-completions',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    supportsReasoning: true,
    supportsImages: true,
  },
  {
    providerId: 'zai',
    providerLabel: 'ZAI',
    modelId: 'glm-4.7',
    modelLabel: 'GLM-4.7',
    authType: 'apiKey',
    api: 'openai-completions',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    supportsReasoning: true,
  },
  {
    providerId: 'zai',
    providerLabel: 'ZAI',
    modelId: 'glm-4.7-flash',
    modelLabel: 'GLM-4.7-Flash',
    authType: 'apiKey',
    api: 'openai-completions',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    supportsReasoning: true,
  },
  {
    providerId: 'zai',
    providerLabel: 'ZAI',
    modelId: 'glm-5',
    modelLabel: 'GLM-5',
    authType: 'apiKey',
    api: 'openai-completions',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    supportsReasoning: true,
  },
]

export function createDefaultAgentModelCatalog() {
  return [...DEFAULT_PROVIDER_MODELS, ...EXTRA_ZAI_MODELS].map((entry) => ({
    ...entry,
    enabled: entry.enabled ?? true,
    isDefault: entry.isDefault ?? false,
    apiKeyEnvNames: entry.apiKeyEnvNames ?? getPiProviderCredentialEnvNames(entry.providerId),
  }))
}
