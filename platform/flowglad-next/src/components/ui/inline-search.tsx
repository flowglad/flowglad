'use client'

import { Loader2, Search, X } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface InlineSearchProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  isLoading?: boolean
  disabled?: boolean
  className?: string
}

/**
 * Always-visible inline search input component.
 * Styled to match the secondary button variant with:
 * - Search icon on the left
 * - Clear button on the right when value is present
 * - Loading spinner when isLoading is true
 * - Secondary button styling (bg-accent, hover states)
 */
function InlineSearch({
  value,
  onChange,
  placeholder = 'Search...',
  isLoading = false,
  disabled = false,
  className,
}: InlineSearchProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleClear = () => {
    onChange('')
    inputRef.current?.focus()
  }

  return (
    <div className={cn('relative flex items-center', className)}>
      {/* Input field */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'peer h-8 w-full rounded border-0',
          'bg-accent text-secondary-foreground',
          'hover:bg-accent/70 dark:hover:bg-accent/90',
          'transition-colors',
          'pl-9 pr-9',
          'text-sm font-medium',
          'placeholder:text-muted-foreground/50',
          'focus:outline-none focus:ring-0 focus:border-0 focus:shadow-none',
          'outline-none ring-0',
          'disabled:pointer-events-none disabled:opacity-50'
        )}
        style={{ outline: 'none', boxShadow: 'none' }}
      />

      {/* Search icon (left) - changes to foreground color when input is focused */}
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground peer-focus:text-foreground transition-colors pointer-events-none" />

      {/* Right side: loading spinner or clear button */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : value ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClear}
            className="h-5 w-5 p-0 hover:bg-muted rounded"
            aria-label="Clear search"
            disabled={disabled}
          >
            <X className="h-3 w-3" />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export { InlineSearch }
export type { InlineSearchProps }
