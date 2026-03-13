import { createFileRoute } from '@tanstack/react-router'
import { AuthCard } from '~/components/auth-card'

export const Route = createFileRoute('/sign-up')({
  component: SignUpPage,
})

function SignUpPage() {
  return <AuthCard mode="sign-up" />
}
