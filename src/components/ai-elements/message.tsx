import * as React from 'react'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'

type MessageFrom = 'user' | 'assistant' | 'system'

export function Message({
  from,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  from: MessageFrom
}) {
  return (
    <div
      data-from={from}
      className={cn(
        'group/message flex w-full',
        from === 'user' && 'justify-end',
        from === 'assistant' && 'justify-start',
        from === 'system' && 'justify-center',
        className,
      )}
      {...props}
    />
  )
}

export function MessageContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex max-w-[92%] flex-col gap-3 border-2 px-4 py-3 shadow-[3px_3px_0_0_oklch(0.92_0_0_/_0.12)]',
        'group-data-[from=user]/message:border-foreground group-data-[from=user]/message:bg-foreground group-data-[from=user]/message:text-background',
        'group-data-[from=assistant]/message:border-border group-data-[from=assistant]/message:bg-card group-data-[from=assistant]/message:text-foreground',
        'group-data-[from=system]/message:max-w-[80%] group-data-[from=system]/message:border-border group-data-[from=system]/message:bg-muted group-data-[from=system]/message:text-foreground',
        className,
      )}
      {...props}
    />
  )
}

export function MessageResponse({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'whitespace-pre-wrap break-words text-sm leading-6',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function MessageToolbar({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mt-2 flex items-center justify-between gap-2', className)}
      {...props}
    />
  )
}

export function MessageActions({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center gap-2', className)}
      {...props}
    />
  )
}

export function MessageAction({
  className,
  label,
  ...props
}: React.ComponentProps<typeof Button> & {
  label: string
}) {
  return (
    <Button
      size="icon-xs"
      variant="outline"
      className={cn('shrink-0', className)}
      aria-label={label}
      {...props}
    />
  )
}
