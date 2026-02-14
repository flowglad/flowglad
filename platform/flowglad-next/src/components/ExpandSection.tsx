'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

interface ExpandSectionProps {
  /** Section title displayed in the header */
  title: ReactNode
  /** Content to display when expanded */
  children: ReactNode
  /** Whether the section is expanded by default */
  defaultExpanded?: boolean
  /** Additional CSS classes for the root element */
  className?: string
  /** Whether to add horizontal padding to content (default: true) */
  contentPadding?: boolean
  /** Whether to show a dashed border on top (default: false) */
  borderTop?: boolean
}

/**
 * ExpandSection component
 *
 * A collapsible section with a header that can be clicked to expand/collapse content.
 * Based on Figma design system with dashed border and chevron indicators.
 */
export function ExpandSection({
  title,
  children,
  defaultExpanded = false,
  className,
  contentPadding = true,
  borderTop = false,
}: ExpandSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={setIsExpanded}
      className={cn(
        'border-b border-dashed border-border relative w-full',
        borderTop && 'border-t',
        className
      )}
    >
      <div className="flex flex-col items-start w-full">
        {/* Header */}
        <div
          className={cn(
            'box-border flex flex-col gap-2.5 items-start w-full',
            isExpanded ? 'pb-1 pt-4 px-6' : 'pt-4 px-6 pb-0'
          )}
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="group bg-transparent box-border flex h-9 items-center justify-between gap-2 px-3 py-2 rounded w-full hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <span className="font-sans font-medium text-base text-foreground leading-6 truncate min-w-0">
                {title}
              </span>
              <div className="rounded-[4px] border border-border bg-background transition-colors group-hover:border-muted-foreground">
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-foreground" />
                )}
              </div>
            </button>
          </CollapsibleTrigger>
        </div>

        {/* Content */}
        <CollapsibleContent
          className={cn(
            'box-border flex flex-col gap-2 items-start pb-4 pt-0 w-full',
            contentPadding && 'px-6'
          )}
        >
          {children}
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
