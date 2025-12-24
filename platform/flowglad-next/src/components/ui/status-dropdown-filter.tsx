'use client'

import { Check, ChevronDown } from 'lucide-react'
import * as React from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface StatusDropdownFilterOption {
  value: string
  label: string
}

interface StatusDropdownFilterProps {
  value: string
  onChange: (value: string) => void
  options: StatusDropdownFilterOption[]
  disabled?: boolean
  className?: string
}

/**
 * Dropdown filter component for status filtering.
 * Designed to match Figma specs (node 26253:6262) with:
 * - Muted background button trigger (bg-accent)
 * - Chevron icon indicator
 * - Radio-style selection with checkmark indicator
 */
function StatusDropdownFilter({
  value,
  onChange,
  options,
  disabled = false,
  className,
}: StatusDropdownFilterProps) {
  // Find the current option label for display
  const currentLabel =
    options.find((opt) => opt.value === value)?.label ?? value

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className={cn(
          'h-8 gap-1 rounded bg-accent px-3',
          'text-sm font-medium',
          'inline-flex items-center',
          'hover:bg-accent/80',
          'data-[state=open]:bg-accent/80',
          'focus:outline-none focus:ring-1 focus:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
      >
        <span>{currentLabel}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[120px]">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={onChange}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              className="relative flex cursor-pointer select-none items-center rounded py-1.5 pl-8 pr-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            >
              <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                {value === option.value && (
                  <Check className="h-4 w-4" />
                )}
              </span>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { StatusDropdownFilter }
export type { StatusDropdownFilterProps, StatusDropdownFilterOption }
