'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useState, type ReactNode } from 'react'

interface ExpandSectionProps {
  /** Section title displayed in the header */
  title: string
  /** Content to display when expanded */
  children: ReactNode
  /** Whether the section is expanded by default */
  defaultExpanded?: boolean
  /** Additional CSS classes for the root element */
  className?: string
  /** Whether to add horizontal padding to content (default: true) */
  contentPadding?: boolean
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
}: ExpandSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={setIsExpanded}
      className={cn(
        'border-b border-border relative w-full',
        className
      )}
      style={{
        borderBottomStyle: 'dashed',
        borderBottomWidth: '1px',
        borderImageSlice: 1,
        borderImageRepeat: 'round',
        borderImageSource:
          'repeating-linear-gradient(to right, hsl(var(--border)) 0, hsl(var(--border)) 4px, transparent 4px, transparent 8px)',
      }}
    >
      <div className="flex flex-col items-start w-full">
        {/* Header */}
        <div
          className={cn(
            'box-border flex flex-col gap-2.5 items-start w-full',
            // TODO: Revert px-0 to px-4 once global page layout redesign is completed
            isExpanded ? 'pb-1 pt-4 px-0' : 'pt-4 px-0 pb-0'
          )}
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="bg-transparent box-border flex h-9 items-center justify-between px-3 py-2 rounded w-full hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <span className="font-sans font-medium text-base text-foreground leading-6">
                {title}
              </span>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-foreground" />
              )}
            </button>
          </CollapsibleTrigger>
        </div>

        {/* Content */}
        <CollapsibleContent
          className={cn(
            'box-border flex flex-col gap-2 items-start pb-4 pt-0 w-full',
            // TODO: Revert px-0 to px-4 once global page layout redesign is completed
            contentPadding && 'px-0'
          )}
        >
          {children}
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
