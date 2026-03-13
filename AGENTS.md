# BuddyPie — Agent Guidelines

## Design System

**Style: Neobrutalist Minimal (Dark)**

- **No rounded corners** — use `rounded-none` or `border` with sharp edges everywhere
- **Hard offset shadows** — solid black offset shadows (e.g. `3px 3px 0 foreground`), never blurred
- **Thick borders** — 2px solid borders using `border-foreground` or `border-border`
- **High contrast** — stark foreground on background, no soft opacity fades
- **Monospace accents** — use `font-mono` for labels, badges, meta text
- **Minimal** — no gradients, no glows, no blur effects, no decorative elements
- **Dark mode only** — `<html className="dark">` is always set
- **Semantic colors** — use shadcn tokens (`bg-background`, `text-foreground`, `border-border`), never raw values
- **Components** — use shadcn/ui (`Button`, `Card`, `Badge`, `Input`, `Textarea`, `Separator`)
- **No fluff copy** — keep text direct and functional, no marketing speak

## Tech Stack

- TanStack Start + Router (Vite, React 19)
- Clerk auth (`@clerk/tanstack-react-start`)
- Convex backend
- shadcn/ui (base-nova style, lucide icons)
- Tailwind CSS v4
- x402 payments on Base Sepolia
