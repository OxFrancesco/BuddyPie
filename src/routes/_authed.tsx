import { Link, Outlet, createFileRoute, useLocation } from '@tanstack/react-router'
import { SignedIn } from '@clerk/tanstack-react-start'
import { AuthCard } from '~/components/auth-card'
import { UserMenu } from '~/components/user-menu'
import { WalletButton } from '~/components/wallet-button'

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context }) => {
    if (!context.userId) {
      throw new Error('Not authenticated')
    }
  },
  errorComponent: ({ error }) => {
    const location = useLocation()

    if (error.message === 'Not authenticated') {
      return <AuthCard mode="sign-in" forceRedirectUrl={location.href} />
    }

    throw error
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b-2 border-foreground bg-background">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            className="flex items-center gap-2 font-bold uppercase tracking-wide"
          >
            <span className="size-2 bg-foreground" />
            BuddyPie
          </Link>
          <div />
          <div className="flex items-center gap-2">
            <SignedIn>
              <WalletButton />
              <UserMenu />
            </SignedIn>
          </div>
        </div>
      </header>
      <div className="py-6">
        <Outlet />
      </div>
    </>
  )
}
