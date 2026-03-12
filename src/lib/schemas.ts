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
