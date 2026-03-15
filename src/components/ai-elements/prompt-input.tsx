import * as React from 'react'
import { LoaderCircle, SendHorizontal } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Textarea } from '~/components/ui/textarea'
import { cn } from '~/lib/utils'

export type PromptInputMessage = {
  text: string
}

export function PromptInput({
  onSubmit,
  className,
  children,
  ...props
}: Omit<React.FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> & {
  onSubmit: (message: PromptInputMessage) => void | Promise<void>
}) {
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const text = String(formData.get('prompt') ?? '')
    await onSubmit({ text })
  }

  return (
    <form
      className={cn(
        'border-2 border-foreground bg-card shadow-[3px_3px_0_0_oklch(0.92_0_0_/_0.12)]',
        className,
      )}
      onSubmit={handleSubmit}
      {...props}
    >
      {children}
    </form>
  )
}

export function PromptInputHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('border-b-2 border-border px-3 py-2', className)}
      {...props}
    />
  )
}

export function PromptInputBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-3 pt-3', className)} {...props} />
  )
}

export function PromptInputFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-t-2 border-border px-3 py-2',
        className,
      )}
      {...props}
    />
  )
}

export function PromptInputTools({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} {...props} />
  )
}

export function PromptInputButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      size="sm"
      variant="outline"
      className={cn('font-mono', className)}
      {...props}
    />
  )
}

export function PromptInputTextarea({
  className,
  onKeyDown,
  name = 'prompt',
  ...props
}: React.ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      name={name}
      className={cn(
        'min-h-[7.5rem] resize-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0',
        className,
      )}
      onKeyDown={(event) => {
        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault()
          event.currentTarget.form?.requestSubmit()
        }
        onKeyDown?.(event)
      }}
      {...props}
    />
  )
}

export function PromptInputSubmit({
  className,
  status = 'ready',
  children,
  ...props
}: React.ComponentProps<typeof Button> & {
  status?: 'ready' | 'submitting' | 'streaming'
}) {
  return (
    <Button
      type="submit"
      size="sm"
      className={cn('min-w-[6.5rem]', className)}
      {...props}
    >
      {status === 'ready' ? (
        <>
          <SendHorizontal className="size-4" />
          {children ?? 'Send'}
        </>
      ) : (
        <>
          <LoaderCircle className="size-4 animate-spin" />
          {children ?? 'Working'}
        </>
      )}
    </Button>
  )
}
