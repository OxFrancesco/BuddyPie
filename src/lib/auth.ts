import { auth, clerkClient } from '@clerk/tanstack-react-start/server'

export async function requireViewerAuth() {
  const authState = await auth()
  if (!authState.userId) {
    throw new Error('Unauthorized')
  }

  return authState
}

export async function getViewerId() {
  const authState = await auth()
  return authState.userId ?? null
}

export async function getGithubOauthToken(userId: string) {
  const oauthTokens = await clerkClient().users.getUserOauthAccessToken(
    userId,
    'github',
  )

  const token = oauthTokens.data[0]
  if (!token?.token) {
    throw new Error(
      'GitHub access token is unavailable for this Clerk user. Reconnect GitHub in Clerk and try again.',
    )
  }

  return token
}
