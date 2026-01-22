'use client'

import { ExternalLink } from 'lucide-react'
import * as motion from 'motion/react-client'
import { cn } from '@/lib/utils'
import type { ChatMessage } from './SupportChatWidget'

interface SupportChatMessageProps {
  message: ChatMessage
  isLatest: boolean
}

function getSourceUrl(path: string): string {
  // Remove .mdx extension if present and ensure path starts with /
  const withoutExtension = path.replace(/\.mdx$/, '')
  const normalizedPath = withoutExtension.startsWith('/')
    ? withoutExtension
    : `/${withoutExtension}`
  return `https://docs.flowglad.com${normalizedPath}`
}

function getSourceDisplayName(source: {
  title?: string
  path: string
}): string {
  if (source.title) return source.title
  // Extract a readable name from the path, removing .mdx extension
  const pathWithoutExtension = source.path.replace(/\.mdx$/, '')
  const pathParts = pathWithoutExtension.split('/').filter(Boolean)
  const lastPart = pathParts[pathParts.length - 1] || 'Documentation'
  // Convert kebab-case to Title Case
  return lastPart
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function SupportChatMessage({
  message,
  isLatest,
}: SupportChatMessageProps) {
  const isUser = message.role === 'user'
  const hasSources =
    !isUser && message.sources && message.sources.length > 0

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
        {hasSources && (
          <div className="mt-2">
            <p className="text-xs text-muted-foreground mb-1">
              Sources:
            </p>
            <div className="flex flex-col gap-1">
              {message.sources!.map((source, index) => (
                <a
                  key={index}
                  href={getSourceUrl(source.path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  {getSourceDisplayName(source)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          </div>
        )}
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
