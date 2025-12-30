'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface CopyableFieldProps {
  value: string
  label: string
  displayText?: string
  truncate?: boolean
}

/**
 * Copyable field component for displaying values with a copy button.
 * Based on Figma design - copy icon is always visible.
 */
export function CopyableField({
  value,
  label,
  displayText,
  truncate,
}: CopyableFieldProps) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'inline-flex items-center gap-1 cursor-pointer group',
              truncate && 'max-w-full min-w-0 overflow-hidden'
            )}
            onClick={handleCopy}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleCopy()
              }
            }}
            aria-label={`Copy ${label}`}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[hsl(var(--jade-muted-foreground))] flex-shrink-0" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground flex-shrink-0 transition-colors" />
            )}
            <span
              className={cn(
                'font-sans font-medium text-sm leading-5 text-muted-foreground group-hover:underline group-hover:text-foreground transition-colors',
                truncate && 'truncate'
              )}
            >
              {copied && displayText
                ? displayText.replace(/^Copy/, 'Copied')
                : (displayText ?? value)}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="font-sans">{value}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
