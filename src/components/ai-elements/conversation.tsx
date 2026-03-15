import * as React from 'react'
import { ArrowDown, Download } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

type ConversationContextValue = {
  isAtBottom: boolean
  scrollToBottom: (behavior?: ScrollBehavior) => void
}

type DownloadMessage = {
  role: string
  content: string
}

const ConversationContext = React.createContext<ConversationContextValue | null>(
  null,
)

function useConversationContext() {
  const context = React.useContext(ConversationContext)
  if (!context) {
    throw new Error('Conversation components must be used inside <Conversation />')
  }
  return context
}

export function messagesToMarkdown(
  messages: DownloadMessage[],
  formatMessage?: (message: DownloadMessage, index: number) => string,
) {
  return messages
    .map((message, index) => {
      if (formatMessage) {
        return formatMessage(message, index)
      }

      return `## ${message.role}\n\n${message.content}`
    })
    .join('\n\n')
}

export function Conversation({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = React.useState(true)

  const updateBottomState = React.useCallback(() => {
    const node = containerRef.current
    if (!node) {
      return
    }

    const distanceFromBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight
    setIsAtBottom(distanceFromBottom < 24)
  }, [])

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = 'smooth') => {
    const node = containerRef.current
    if (!node) {
      return
    }

    node.scrollTo({
      top: node.scrollHeight,
      behavior,
    })
  }, [])

  React.useEffect(() => {
    const node = containerRef.current
    if (!node) {
      return
    }

    updateBottomState()

    const handleScroll = () => updateBottomState()
    node.addEventListener('scroll', handleScroll)

    return () => node.removeEventListener('scroll', handleScroll)
  }, [updateBottomState])

  React.useEffect(() => {
    if (isAtBottom) {
      scrollToBottom('auto')
    }
  }, [children, isAtBottom, scrollToBottom])

  return (
    <ConversationContext.Provider value={{ isAtBottom, scrollToBottom }}>
      <div
        ref={containerRef}
        className={cn(
          'relative min-h-0 flex-1 overflow-y-auto bg-background',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </ConversationContext.Provider>
  )
}

export function ConversationContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex min-h-full flex-col gap-4 px-4 py-4', className)}
      {...props}
    />
  )
}

export function ConversationEmptyState({
  title,
  description,
  icon,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  title: string
  description: string
  icon?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex min-h-[20rem] flex-col items-center justify-center gap-3 border-2 border-dashed border-border bg-card px-6 py-8 text-center',
        className,
      )}
      {...props}
    >
      {icon ? (
        <div className="flex size-12 items-center justify-center border-2 border-border bg-muted">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}

export function ConversationScrollButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { isAtBottom, scrollToBottom } = useConversationContext()

  if (isAtBottom) {
    return null
  }

  return (
    <Button
      size="icon-sm"
      variant="outline"
      className={cn('absolute right-4 bottom-4 z-10', className)}
      onClick={() => scrollToBottom()}
      {...props}
    >
      <ArrowDown className="size-4" />
      <span className="sr-only">Scroll to latest message</span>
    </Button>
  )
}

export function ConversationDownload({
  messages,
  filename = 'conversation.md',
  className,
  formatMessage,
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'onClick'> & {
  messages: DownloadMessage[]
  filename?: string
  formatMessage?: (message: DownloadMessage, index: number) => string
}) {
  const handleDownload = React.useCallback(() => {
    const markdown = messagesToMarkdown(messages, formatMessage)
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(objectUrl)
  }, [filename, formatMessage, messages])

  return (
    <Button
      size="sm"
      variant="outline"
      className={cn('absolute top-4 right-4 z-10', className)}
      onClick={handleDownload}
      {...props}
    >
      <Download className="size-4" />
      Download
    </Button>
  )
}
