import { z } from 'zod'
import { isAgentSlug } from './buddypie-config'

export const workspaceImportSchema = z.object({
  repo: z.string().min(3),
})

export const workspaceRunSchema = z.object({
  agentSlug: z.string().refine(isAgentSlug, 'Unknown agent slug'),
  prompt: z.string().min(1),
  payerWallet: z.string().optional(),
})

export const runMessageSchema = z.object({
  prompt: z.string().min(1),
})

export const workspaceGitBranchSchema = z.object({
  branchName: z.string().trim().min(1).max(120),
  checkout: z.boolean().optional(),
})

export const workspaceGitCommitSchema = z.object({
  message: z.string().trim().min(1).max(200),
  files: z.array(z.string().trim().min(1)).optional(),
})

export const workspaceGitPushSchema = z.object({})

export const workspaceGitPullRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(10_000).optional(),
  baseBranch: z.string().trim().min(1).optional(),
  draft: z.boolean().optional(),
})

export const a2aRequestSchema = z.object({
  repo: z.string().min(3),
  message: z.string().min(1),
  payerWallet: z.string().optional(),
})

export const mcpRequestSchema = z.object({
  jsonrpc: z.literal('2.0').optional(),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.any().optional(),
})
