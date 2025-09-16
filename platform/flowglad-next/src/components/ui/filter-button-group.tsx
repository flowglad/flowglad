'use client'

import * as React from 'react'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

interface FilterOption {
  value: string
  label: string
  count?: number
}

interface FilterButtonGroupProps {
  options: FilterOption[]
  value: string
  onValueChange: (value: string) => void
  className?: string
}

export function FilterButtonGroup({
  options,
  value,
  onValueChange,
  className,
}: FilterButtonGroupProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(newValue) =>
        newValue && onValueChange(newValue)
      }
      className={cn('gap-0 justify-start', className)}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className={cn(
            // Ghost button styling when not selected
            'data-[state=off]:hover:bg-accent data-[state=off]:hover:text-foreground text-muted-foreground',
            // Selected state styling
            'data-[state=on]:bg-accent data-[state=on]:text-foreground',
            // Base styling
            'px-3 py-1 text-sm font-medium transition-all rounded-full duration-200'
          )}
        >
          <span>{option.label}</span>
          {option.count !== undefined && (
            <span className="ml-1 text-xs opacity-60">
              {option.count}
            </span>
          )}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
