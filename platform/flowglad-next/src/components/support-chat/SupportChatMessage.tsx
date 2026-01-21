'use client'

import * as motion from 'motion/react-client'
import { cn } from '@/lib/utils'
import type { ChatMessage } from './SupportChatWidget'

interface SupportChatMessageProps {
  message: ChatMessage
  isLatest: boolean
}

export function SupportChatMessage({
  message,
  isLatest,
}: SupportChatMessageProps) {
  const isUser = message.role === 'user'

  const content = (
    <div
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'rounded-lg px-3 py-2 text-sm max-w-[85%]',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        )}
      >
        <p className="whitespace-pre-wrap break-words">
          {message.content}
        </p>
      </div>
    </div>
  )

  if (isLatest) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {content}
      </motion.div>
    )
  }

  return content
}
