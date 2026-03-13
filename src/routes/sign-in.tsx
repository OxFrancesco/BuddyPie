import { createFileRoute } from '@tanstack/react-router'
import { AuthCard } from '~/components/auth-card'

export const Route = createFileRoute('/sign-in')({
  component: SignInPage,
})

function SignInPage() {
  return <AuthCard mode="sign-in" />
}
