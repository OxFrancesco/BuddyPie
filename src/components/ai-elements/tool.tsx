import * as React from 'react'
import {
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Play,
  TriangleAlert,
} from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { cn } from '~/lib/utils'

type ToolState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error'

function formatToolName(type: string) {
  return type
    .replace(/^tool-/, '')
    .replace(/^tool_/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
}

function getToolStateBadge(state: ToolState) {
  switch (state) {
    case 'output-available':
      return {
        icon: CheckCircle2,
        label: 'done',
        variant: 'secondary' as const,
      }
    case 'output-error':
      return {
        icon: TriangleAlert,
        label: 'error',
        variant: 'destructive' as const,
      }
    case 'input-streaming':
      return {
        icon: CircleDashed,
        label: 'queued',
        variant: 'outline' as const,
      }
    default:
      return {
        icon: Play,
        label: 'running',
        variant: 'outline' as const,
      }
  }
}

export function Tool({
  className,
  children,
  defaultOpen = false,
  ...props
}: React.ComponentProps<'details'> & { defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen)

  return (
    <details
      open={open}
      className={cn('group/tool border-2 border-border bg-card', className)}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      {...props}
    >
      {children}
    </details>
  )
}

export function ToolHeader({
  title,
  type,
  state,
  className,
  ...props
}: React.ComponentProps<'summary'> & {
  title?: string
  type: string
  state: ToolState
}) {
  const badge = getToolStateBadge(state)
  const Icon = badge.icon

  return (
    <summary
      className={cn(
        'flex cursor-pointer list-none items-center justify-between gap-3 border-b-2 border-border px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden',
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center border-2 border-border bg-muted">
          <Icon className="size-3.5" />
        </span>
        <span className="truncate">{title ?? formatToolName(type)}</span>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={badge.variant} className="font-mono uppercase">
          {badge.label}
        </Badge>
        <ChevronDown className="size-4" />
      </div>
    </summary>
  )
}

export function ToolContent({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex flex-col gap-3 px-3 py-3', className)} {...props} />
  )
}

export function ToolInput({
  input,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  input?: unknown
}) {
  if (input == null) {
    return null
  }

  return (
    <div className={cn('flex flex-col gap-1', className)} {...props}>
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-muted-foreground">
        Input
      </p>
      <pre className="overflow-x-auto border-2 border-border bg-background px-3 py-2 text-xs leading-5 whitespace-pre-wrap">
        {typeof input === 'string' ? input : JSON.stringify(input, null, 2)}
      </pre>
    </div>
  )
}

export function ToolOutput({
  output,
  errorText,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  output?: React.ReactNode
  errorText?: React.ReactNode
}) {
  if (!output && !errorText) {
    return null
  }

  return (
    <div className={cn('flex flex-col gap-1', className)} {...props}>
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-muted-foreground">
        Output
      </p>
      <div
        className={cn(
          'border-2 px-3 py-2 text-xs leading-5',
          errorText
            ? 'border-destructive bg-destructive/10 text-destructive'
            : 'border-border bg-background text-foreground',
        )}
      >
        {errorText ?? output}
      </div>
    </div>
  )
}
