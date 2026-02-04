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
 *
 * On iOS Safari, uses a hidden input technique to ensure the keyboard
 * automatically appears when the drawer opens.
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

  // Refs for iOS keyboard focus technique
  const hiddenInputRef = React.useRef<HTMLInputElement>(null)
  const commandInputRef = React.useRef<HTMLInputElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)

  const handleSelect = (selectedValue: string) => {
    onValueChange(selectedValue)
    setOpen(false)
  }

  /**
   * iOS Safari only triggers the keyboard when focus happens in direct
   * response to a user gesture. By focusing a hidden input immediately
   * on tap, we "capture" the gesture and open the keyboard. Then we
   * transfer focus to the real input after the drawer renders.
   */
  const handleMobileTriggerClick = () => {
    // Focus hidden input immediately - this captures the user gesture
    // and triggers the iOS keyboard to open
    hiddenInputRef.current?.focus()

    // Open the drawer
    setOpen(true)
  }

  /**
   * Transfer focus from hidden input to the real CommandInput
   * after the drawer has opened and rendered.
   */
  const handleDrawerOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      // Use nested requestAnimationFrame to ensure DOM is ready
      // First rAF: after React commits
      // Second rAF: after browser paints
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          commandInputRef.current?.focus()
        })
      })
    }
    setOpen(isOpen)
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
      <>
        {/*
          Hidden input for iOS keyboard trigger.
          This input captures the user gesture to open the keyboard,
          then focus transfers to the real CommandInput.
          Position it off-screen but keep it focusable.
        */}
        <input
          ref={hiddenInputRef}
          type="text"
          aria-hidden="true"
          tabIndex={-1}
          className="absolute -left-[9999px] top-0 h-0 w-0 opacity-0"
          readOnly
        />
        <Drawer open={open} onOpenChange={handleDrawerOpenChange}>
          {/*
            Use onClick on DrawerTrigger to handle the click manually
            for iOS keyboard focus technique.
          */}
          <DrawerTrigger asChild onClick={handleMobileTriggerClick}>
            {TriggerButton}
          </DrawerTrigger>
          <DrawerContent className="px-1 pb-1 bg-input-bg [&>div:first-child]:bg-foreground [&>div:first-child]:h-1.5 [&>div:first-child]:my-2">
            {/* Visually hidden title for accessibility */}
            <DrawerTitle className="sr-only">
              {placeholder}
            </DrawerTitle>
            <Command className="bg-input-bg [&_[cmdk-input-wrapper]]:-mx-2 [&_[cmdk-input-wrapper]]:px-5 [&_[cmdk-item]]:text-base">
              <CommandInput
                ref={commandInputRef}
                placeholder={searchPlaceholder}
              />
              {OptionsList}
            </Command>
          </DrawerContent>
        </Drawer>
      </>
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
