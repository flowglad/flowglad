import { cn } from '@/utils/core'
import { MessageCircle } from 'lucide-react'

interface ChatMessageProps {
  message: string
  classification: 'ai' | 'user'
  isLoading?: boolean
  dataOutput?: any
  id?: string
}

export function ChatMessage({
  message,
  classification,
  isLoading,
  dataOutput,
  id,
}: ChatMessageProps) {
  if (isLoading) {
    return (
      <div className="flex items-start gap-3">
        <div className="w-6 h-6">
          <MessageCircle size={24} />
        </div>
        <div className="flex items-center gap-2">
          <div className="animate-pulse">
            <div className="h-6 w-20 bg-muted/80 rounded-md">
              <div className="h-full w-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3',
        classification === 'user' && 'justify-end'
      )}
    >
      {classification === 'ai' && (
        <div className="w-6 h-6">
          <MessageCircle size={24} />
        </div>
      )}
      <div
        className={cn(
          'max-w-[80%] text-sm',
          classification === 'user'
            ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2'
            : 'text-foreground'
        )}
      >
        {message}
      </div>
    </div>
  )
}
