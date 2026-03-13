import { useSignIn, useSignUp } from '@clerk/tanstack-react-start'
import { Github } from 'lucide-react'

type AuthCardProps = {
  mode: 'sign-in' | 'sign-up'
  forceRedirectUrl?: string
}

export function AuthCard({ mode, forceRedirectUrl }: AuthCardProps) {
  const { signIn, isLoaded: signInLoaded } = useSignIn()
  const { signUp, isLoaded: signUpLoaded } = useSignUp()

  const isLoaded = mode === 'sign-in' ? signInLoaded : signUpLoaded
  const redirectUrl = forceRedirectUrl ?? '/dashboard'

  const handleGitHub = async () => {
    if (!isLoaded) return
    const target = mode === 'sign-in' ? signIn : signUp
    await target!.authenticateWithRedirect({
      strategy: 'oauth_github',
      redirectUrl: '/sso-callback',
      redirectUrlComplete: redirectUrl,
    })
  }

  return (
    <div className="w-full max-w-sm border-2 border-foreground bg-card shadow-[4px_4px_0_0_oklch(0.92_0_0_/_0.3)]">
        <div className="border-b-2 border-foreground px-6 py-5 text-center">
          <div className="mx-auto mb-3 flex size-8 items-center justify-center bg-foreground">
            <div className="size-3 bg-background" />
          </div>
          <h1 className="font-mono text-lg font-bold uppercase tracking-wide">
            BuddyPie
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {mode === 'sign-in'
              ? 'Sign in to your account'
              : 'Create your account'}
          </p>
        </div>

        <div className="px-6 py-6">
          <button
            type="button"
            onClick={handleGitHub}
            disabled={!isLoaded}
            className="flex w-full items-center justify-center gap-2 border-2 border-foreground bg-foreground px-4 py-2.5 font-mono text-sm font-medium text-background shadow-[3px_3px_0_0_oklch(0.92_0_0_/_0.3)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-[1px_1px_0_0_oklch(0.92_0_0_/_0.3)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:pointer-events-none disabled:opacity-50"
          >
            <Github className="size-4" />
            Continue with GitHub
          </button>
        </div>

        <div className="border-t-2 border-foreground px-6 py-3 text-center">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Powered by x402 & 8004
          </p>
        </div>
    </div>
  )
}
