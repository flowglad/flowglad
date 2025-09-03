'use client'

import * as React from 'react'
import { cn } from '@/registry/lib/cn'

interface PricingToggleProps {
  options: string[]
  selected: string
  onChange: (value: string) => void
  className?: string
}

export function PricingToggle({
  options,
  selected,
  onChange,
  className,
}: PricingToggleProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center p-1 bg-muted rounded-full',
        className
      )}
    >
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={cn(
            'px-3 sm:px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            selected === option
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option}
        </button>
      ))}
    </div>
  )
}
