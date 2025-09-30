'use client'

import * as React from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DataTableCopyableCellProps {
  copyText: string
  children: React.ReactNode
  className?: string
}

export function DataTableCopyableCell({
  copyText,
  children,
  className,
}: DataTableCopyableCellProps) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async (
    e: React.MouseEvent | React.KeyboardEvent
  ) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy text:', error)
    }
  }

  return (
    <div
      className={cn(
        'flex items-center gap-0.5 group cursor-pointer transition-colors select-none',
        className
      )}
      onClick={handleCopy}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleCopy(e)
        }
      }}
      role="button"
      tabIndex={0}
      title={`Click to copy ${copyText}`}
      aria-label={`Copy ${copyText}`}
    >
      <span className="truncate group-hover:underline transition-colors">
        {children}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation() // Prevent double triggering
          handleCopy(e)
        }}
        title={`Copy ${copyText}`}
        tabIndex={-1} // Remove from tab order since container is focusable
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-600" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  )
}
