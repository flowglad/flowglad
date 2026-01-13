'use client'

import { ChevronDown } from 'lucide-react'
import * as React from 'react'

import { Button, type ButtonProps } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface GhostSelectOption {
  value: string
  label: string
}

interface GhostSelectProps {
  /** Current selected value */
  value: string
  /** Callback when value changes */
  onValueChange: (value: string) => void
  /** Available options */
  options: GhostSelectOption[]
  /** Optional prefix text displayed before the value (e.g., "by ") */
  prefix?: string
  /** Additional classes for the trigger button */
  className?: string
  /** Alignment of the dropdown content */
  align?: 'start' | 'center' | 'end'
  /** Whether the select is disabled */
  disabled?: boolean
  /** Size variant matching Button component. Defaults to 'sm'. */
  size?: ButtonProps['size']
}

/**
 * A select component styled as a ghost button with dropdown menu.
 * Uses the ghost button variant with Button's standard sizing.
 *
 * @example
 * <GhostSelect
 *   value={interval}
 *   onValueChange={setInterval}
 *   options={[
 *     { value: 'day', label: 'Day' },
 *     { value: 'week', label: 'Week' },
 *   ]}
 *   prefix="by "
 * />
 *
 * @example
 * // With custom size
 * <GhostSelect
 *   value={value}
 *   onValueChange={setValue}
 *   options={options}
 *   size="default"
 * />
 */
export function GhostSelect({
  value,
  onValueChange,
  options,
  prefix,
  className,
  align = 'start',
  disabled = false,
  size = 'sm',
}: GhostSelectProps) {
  const currentOption = options.find((opt) => opt.value === value)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          variant="ghost"
          size={size}
          disabled={disabled}
          className={cn(className)}
        >
          {prefix && (
            <span className="text-muted-foreground">{prefix}</span>
          )}
          <span>{currentOption?.label ?? value}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={onValueChange}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
