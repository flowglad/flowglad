'use client'

import * as React from 'react'
import { Search, X } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const collapsibleSearchVariants = cva('relative', {
  variants: {
    size: {
      default: '',
      sm: '',
      lg: '',
    },
  },
  defaultVariants: {
    size: 'default',
  },
})

const buttonSizeVariants = {
  default: 'h-9 w-9',
  sm: 'h-8 w-8',
  lg: 'h-10 w-10',
}

const inputSizeVariants = {
  default: 'h-9 pl-9 pr-9 text-sm',
  sm: 'h-8 pl-8 pr-8 text-xs',
  lg: 'h-10 pl-10 pr-10 text-sm',
}

const iconSizeVariants = {
  default: 'h-4 w-4',
  sm: 'h-3.5 w-3.5',
  lg: 'h-4 w-4',
}

const closeButtonSizeVariants = {
  default: 'h-7 w-7 right-1',
  sm: 'h-6 w-6 right-1',
  lg: 'h-8 w-8 right-1',
}

const iconPositionVariants = {
  default: 'left-3',
  sm: 'left-2.5',
  lg: 'left-3.5',
}

const loadingPositionVariants = {
  default: 'right-9',
  sm: 'right-8',
  lg: 'right-10',
}

const closeIconSizeVariants = {
  default: 'h-3 w-3',
  sm: 'h-2.5 w-2.5',
  lg: 'h-3.5 w-3.5',
}

interface CollapsibleSearchProps
  extends VariantProps<typeof collapsibleSearchVariants> {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  isLoading?: boolean
  className?: string
  inputClassName?: string
  onExpand?: () => void
  onCollapse?: () => void
}

function CollapsibleSearch({
  value,
  onChange,
  size = 'default',
  placeholder = 'Search...',
  disabled = false,
  isLoading = false,
  className,
  inputClassName,
  onExpand,
  onCollapse,
}: CollapsibleSearchProps) {
  // Ensure size is never null
  const currentSize = size || 'default'
  const [isExpanded, setIsExpanded] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Handle search expansion
  const handleExpand = () => {
    setIsExpanded(true)
    onExpand?.()
    // Focus the input after a small delay to ensure it's rendered
    setTimeout(() => {
      inputRef.current?.focus()
    }, 50)
  }

  // Handle search collapse and clear
  const handleCollapse = () => {
    setIsExpanded(false)
    onChange('')
    onCollapse?.()
  }

  return (
    <div
      className={cn(
        collapsibleSearchVariants({ size: currentSize, className })
      )}
    >
      {!isExpanded ? (
        // Collapsed state: Icon-only button
        <Button
          variant="outline"
          onClick={handleExpand}
          className={cn(
            buttonSizeVariants[currentSize],
            'p-0 rounded-full hover:bg-muted'
          )}
          disabled={disabled}
          aria-label="Open search"
        >
          <Search className={iconSizeVariants[currentSize]} />
        </Button>
      ) : (
        // Expanded state: Full search input with animations
        <div className="relative flex items-center">
          <div className="relative animate-in slide-in-from-right-2 duration-200">
            <Search
              className={cn(
                'absolute top-1/2 -translate-y-1/2 text-muted-foreground',
                iconSizeVariants[currentSize],
                iconPositionVariants[currentSize]
              )}
            />
            <Input
              ref={inputRef}
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className={cn(
                'max-w-sm rounded-full',
                inputSizeVariants[currentSize],
                inputClassName
              )}
              disabled={disabled}
            />
            {isLoading && (
              <div
                className={cn(
                  'absolute top-1/2 -translate-y-1/2',
                  loadingPositionVariants[currentSize]
                )}
              >
                <div
                  className={cn(
                    'animate-spin rounded-full border-2 border-gray-300 border-t-gray-600',
                    iconSizeVariants[currentSize]
                  )}
                />
              </div>
            )}
            <Button
              variant="ghost"
              onClick={handleCollapse}
              className={cn(
                'absolute top-1/2 -translate-y-1/2 p-0 rounded-full hover:bg-muted',
                closeButtonSizeVariants[currentSize]
              )}
              aria-label="Clear search"
            >
              <X className={closeIconSizeVariants[currentSize]} />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export { CollapsibleSearch, collapsibleSearchVariants }
