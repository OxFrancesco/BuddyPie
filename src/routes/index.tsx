import { Link, createFileRoute } from '@tanstack/react-router'
import { SignInButton, SignedIn, SignedOut } from '@clerk/tanstack-react-start'
import { PLATFORM_AGENT_PROFILES } from '~/lib/buddypie-config'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div className="landing-page">
      <section className="hero-panel">
        <div className="hero-panel__copy">
          <p className="eyebrow">Hackathon MVP</p>
          <h1>Paid coding agents inside persistent Daytona sandboxes.</h1>
          <p className="hero-lead">
            BuddyPie authenticates with Clerk GitHub OAuth, clones a repository into a
            persistent sandbox, and runs a profile-specific PI agent that gets paid with
            x402 on Base Sepolia.
          </p>
          <div className="hero-actions">
            <SignedOut>
              <SignInButton mode="modal">
                <button className="button button-primary" type="button">
                  Sign in with GitHub
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <Link to="/dashboard" className="button button-primary">
                Open dashboard
              </Link>
            </SignedIn>
            <a
              className="button button-muted"
              href="https://eips.ethereum.org/EIPS/eip-8004"
              target="_blank"
              rel="noreferrer"
            >
              ERC-8004 spec
            </a>
          </div>
        </div>
        <div className="hero-panel__stack">
          <div className="stack-card">
            <span className="stack-card__label">Flow</span>
            <p>
              GitHub login {'->'} repo import {'->'} persistent sandbox {'->'} x402
              paid run {'->'} browser preview.
            </p>
          </div>
          <div className="stack-card">
            <span className="stack-card__label">Agents</span>
            <ul className="mini-list">
              {PLATFORM_AGENT_PROFILES.map((profile) => (
                <li key={profile.slug}>
                  <strong>{profile.name}</strong> {profile.priceLabel}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="feature-grid">
        <article className="feature-card">
          <h2>Persistent workspaces</h2>
          <p>
            One sandbox per repository. The repo stays cloned, PI session history stays on
            disk, and the next paid run picks up with the same context.
          </p>
        </article>
        <article className="feature-card">
          <h2>Profile-isolated PI packs</h2>
          <p>
            Frontend and docs runs load BuddyPie-owned skills and extensions only, with no
            ambient Codex or Claude skill directories leaking into the sandbox.
          </p>
        </article>
        <article className="feature-card">
          <h2>x402 on Base Sepolia</h2>
          <p>
            Paid execution is gated with x402. The UI can pay a 402 challenge from an
            injected wallet after switching to Base Sepolia.
          </p>
        </article>
      </section>
    </div>
  )
}
