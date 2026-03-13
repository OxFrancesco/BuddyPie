import { Link, createFileRoute } from '@tanstack/react-router'
import { SignedIn, SignedOut } from '@clerk/tanstack-react-start'
import { Button } from '~/components/ui/button'
import { AuthCard } from '~/components/auth-card'
import { X } from 'lucide-react'
import * as React from 'react'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const [showSignIn, setShowSignIn] = React.useState(false)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <pre className="hidden select-none font-mono text-[0.5rem] leading-none text-muted-foreground/40 sm:block sm:text-xs">
{`██████╗ ██╗   ██╗██████╗ ██████╗ ██╗   ██╗██████╗ ██╗███████╗
██╔══██╗██║   ██║██╔══██╗██╔══██╗╚██╗ ██╔╝██╔══██╗██║██╔════╝
██████╔╝██║   ██║██║  ██║██║  ██║ ╚████╔╝ ██████╔╝██║█████╗  
██╔══██╗██║   ██║██║  ██║██║  ██║  ╚██╔╝  ██╔═══╝ ██║██╔══╝  
██████╔╝╚██████╔╝██████╔╝██████╔╝   ██║   ██║     ██║███████╗
╚═════╝  ╚═════╝ ╚═════╝ ╚═════╝    ╚═╝   ╚═╝     ╚═╝╚══════╝`}
      </pre>

      <h1 className="mt-8 max-w-lg text-3xl font-bold tracking-tight">
        Powerful agents at your fingertips!
      </h1>
      <p className="mt-2 text-xs text-muted-foreground/60">
        Powered by x402 & 8004
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <SignedOut>
          <Button onClick={() => setShowSignIn(true)}>Get started</Button>
        </SignedOut>
        <SignedIn>
          <Button render={<Link to="/dashboard" />}>
            Dashboard
          </Button>
        </SignedIn>
        <Button
          variant="outline"
          render={
            <a
              href="https://eips.ethereum.org/EIPS/eip-8004"
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          ERC-8004
        </Button>
      </div>

      {showSignIn && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80"
          onClick={() => setShowSignIn(false)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowSignIn(false)}
              className="absolute -top-3 -right-3 z-10 flex size-7 items-center justify-center border-2 border-foreground bg-background text-foreground transition-colors hover:bg-foreground hover:text-background"
            >
              <X className="size-3.5" />
            </button>
            <AuthCard mode="sign-in" />
          </div>
        </div>
      )}
    </div>
  )
}
