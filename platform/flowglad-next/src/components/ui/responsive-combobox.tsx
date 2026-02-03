'use client'

import { Check, ChevronDown } from 'lucide-react'
import * as React from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { BREAKPOINT_SM, useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

// Match SelectTrigger styling exactly (using bg-input-bg for input background)
const triggerClasses =
  'flex h-12 w-full items-center justify-between whitespace-nowrap rounded border border-input bg-input-bg text-card-foreground px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:border-foreground disabled:cursor-not-allowed disabled:opacity-50'

export interface ResponsiveComboboxOption {
  value: string
  label: string
  searchValue?: string
}

interface ResponsiveComboboxProps {
  options: ResponsiveComboboxOption[]
  value: string | undefined
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  /** Optional ID for the listbox element (for accessibility) */
  listboxId?: string
  /** Optional class name for the trigger button */
  triggerClassName?: string
}

/**
 * A responsive combobox component that renders as a Popover on desktop
 * and a Drawer on mobile devices.
 *
 * This solves the mobile keyboard repositioning issue where Radix UI's
 * Popover would jump around when the soft keyboard appears/disappears.
 */
export function ResponsiveCombobox({
  options,
  value,
  onValueChange,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search...',
  emptyText = 'No results found.',
  listboxId,
  triggerClassName,
}: ResponsiveComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const isMobile = useIsMobile(BREAKPOINT_SM)

  const selectedOption = options.find((opt) => opt.value === value)

  const handleSelect = (selectedValue: string) => {
    onValueChange(selectedValue)
    setOpen(false)
  }

  const TriggerButton = (
    <button
      type="button"
      role="combobox"
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-controls={listboxId}
      className={cn(triggerClasses, triggerClassName)}
    >
      <span
        className={cn(
          'line-clamp-1',
          !selectedOption && 'text-muted-foreground'
        )}
      >
        {selectedOption?.label ?? placeholder}
      </span>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </button>
  )

  const OptionsList = (
    <CommandList id={listboxId} className="max-h-48">
      <CommandEmpty>{emptyText}</CommandEmpty>
      <CommandGroup>
        {options.map((option) => (
          <CommandItem
            key={option.value}
            value={option.searchValue ?? option.label}
            onSelect={() => handleSelect(option.value)}
            className="cursor-pointer"
          >
            {option.label}
            <Check
              className={cn(
                'ml-auto h-4 w-4',
                value === option.value ? 'opacity-100' : 'opacity-0'
              )}
            />
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandList>
  )

  // On mobile, use a Drawer that slides up from the bottom
  // This avoids the keyboard repositioning issues with Popover
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{TriggerButton}</DrawerTrigger>
        <DrawerContent className="px-1 pb-1 bg-input-bg [&>div:first-child]:bg-foreground [&>div:first-child]:h-1.5 [&>div:first-child]:my-2">
          {/* Visually hidden title for accessibility */}
          <DrawerTitle className="sr-only">{placeholder}</DrawerTitle>
          <Command className="bg-input-bg [&_[cmdk-input-wrapper]]:-mx-2 [&_[cmdk-input-wrapper]]:px-5">
            <CommandInput placeholder={searchPlaceholder} />
            {OptionsList}
          </Command>
        </DrawerContent>
      </Drawer>
    )
  }

  // On desktop, use a Popover positioned below the trigger
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{TriggerButton}</PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0 bg-input-bg"
        align="start"
      >
        <Command className="bg-input-bg">
          <CommandInput placeholder={searchPlaceholder} />
          {OptionsList}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
