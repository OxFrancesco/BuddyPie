import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouteContext,
} from '@tanstack/react-router'
import {
  ClerkProvider,
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
} from '@clerk/tanstack-react-start'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { createServerFn } from '@tanstack/react-start'
import * as React from 'react'
import { auth } from '@clerk/tanstack-react-start/server'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import type { ConvexQueryClient } from '@convex-dev/react-query'
import type { ConvexReactClient } from 'convex/react'
import type { QueryClient } from '@tanstack/react-query'
import appCss from '~/styles/app.css?url'
import { WalletButton } from '~/components/wallet-button'
import { WalletProvider } from '~/components/wallet-provider'

const fetchClerkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const { getToken, userId } = await auth()
  const token = await getToken({ template: 'convex' })

  return {
    userId,
    token,
  }
})

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
  convexClient: ConvexReactClient
  convexQueryClient: ConvexQueryClient
}>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'BuddyPie',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/apple-touch-icon.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/favicon-32x32.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: '/favicon-16x16.png',
      },
      { rel: 'manifest', href: '/site.webmanifest', color: '#fffff' },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  beforeLoad: async (ctx) => {
    const clerkAuth = await fetchClerkAuth()
    const { userId, token } = clerkAuth
    // During SSR only (the only time serverHttpClient exists),
    // set the Clerk auth token to make HTTP queries with.
    if (token) {
      ctx.context.convexQueryClient.serverHttpClient?.setAuth(token)
    }

    return {
      userId,
      token,
    }
  },
  component: RootComponent,
})

function RootComponent() {
  const context = useRouteContext({ from: Route.id })

  return (
    <ClerkProvider>
      <ConvexProviderWithClerk client={context.convexClient} useAuth={useAuth}>
        <WalletProvider>
          <RootDocument>
            <Outlet />
          </RootDocument>
        </WalletProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="app-shell">
          <header className="topbar">
            <Link
              to="/"
              activeOptions={{ exact: true }}
              className="brandmark"
            >
              <span className="brandmark__orb" />
              BuddyPie
            </Link>
            <nav className="topbar__links">
              <Link to="/" activeOptions={{ exact: true }} className="topbar__link">
                Home
              </Link>
              <SignedIn>
                <Link to="/dashboard" className="topbar__link">
                  Dashboard
                </Link>
              </SignedIn>
            </nav>
            <div className="topbar__actions">
              <SignedIn>
                <WalletButton />
              </SignedIn>
              <div>
                <SignedIn>
                  <UserButton />
                </SignedIn>
                <SignedOut>
                  <SignInButton mode="modal" />
                </SignedOut>
              </div>
            </div>
          </header>
          <main className="page-frame">{children}</main>
        </div>
        <div className="app-backdrop" />
        <div className="app-noise" />
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  )
}
