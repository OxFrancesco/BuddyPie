import { useClerk, useUser } from '@clerk/tanstack-react-start'
import { LogOut, Settings } from 'lucide-react'
import { useRef, useState } from 'react'

export function UserMenu() {
  const { user } = useUser()
  const { signOut, openUserProfile } = useClerk()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  if (!user) return null

  const initials =
    (user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '') ||
    user.username?.[0]?.toUpperCase() ||
    '?'

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="size-8 border-2 border-foreground bg-foreground transition-all hover:translate-x-px hover:translate-y-px active:translate-x-0.5 active:translate-y-0.5"
      >
        {user.imageUrl ? (
          <img
            src={user.imageUrl}
            alt={user.fullName ?? 'Avatar'}
            className="size-full object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center font-mono text-xs font-bold text-background">
            {initials}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-2 w-56 border-2 border-foreground bg-card shadow-[4px_4px_0_0_oklch(0.92_0_0_/_0.3)]">
            <div className="border-b-2 border-foreground px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="size-9 shrink-0 border-2 border-foreground">
                  {user.imageUrl ? (
                    <img
                      src={user.imageUrl}
                      alt={user.fullName ?? 'Avatar'}
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center bg-foreground font-mono text-xs font-bold text-background">
                      {initials}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-bold text-foreground">
                    {user.fullName ?? user.username}
                  </p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    {user.username ?? user.primaryEmailAddress?.emailAddress}
                  </p>
                </div>
              </div>
            </div>

            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  openUserProfile()
                }}
                className="flex w-full items-center gap-3 px-4 py-2.5 font-mono text-xs uppercase tracking-wide text-foreground transition-colors hover:bg-accent"
              >
                <Settings className="size-3.5" />
                Manage account
              </button>
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex w-full items-center gap-3 px-4 py-2.5 font-mono text-xs uppercase tracking-wide text-foreground transition-colors hover:bg-accent"
              >
                <LogOut className="size-3.5" />
                Sign out
              </button>
            </div>

            <div className="border-t-2 border-foreground px-4 py-2 text-center">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Powered by x402 & 8004
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
