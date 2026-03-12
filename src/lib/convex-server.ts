import { auth } from '@clerk/tanstack-react-start/server'
import { ConvexHttpClient } from 'convex/browser'
import { api as generatedApi } from '../../convex/_generated/api'
import { requireConvexUrl } from './server-env'

export const convexApi = generatedApi as any

export async function createServerConvexClient(options?: {
  useViewerToken?: boolean
}) {
  const client = new ConvexHttpClient(requireConvexUrl())

  if (options?.useViewerToken !== false) {
    const { getToken } = await auth()
    const token = await getToken({ template: 'convex' })
    if (token) {
      client.setAuth(token)
    }
  }

  return client
}
