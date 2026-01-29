'use client'

import { Check, ChevronDown } from 'lucide-react'
import * as React from 'react'
import { useMultiStepForm } from '@/components/onboarding/MultiStepForm'
import { StepContainer } from '@/components/onboarding/StepContainer'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { REFERRAL_OPTIONS } from '@/utils/referrals'
import { type BusinessDetailsFormData } from './schemas'

// Match SelectTrigger styling exactly (using bg-input-bg for input background)
const selectTriggerClasses =
  'flex h-12 w-full items-center justify-between whitespace-nowrap rounded border border-input bg-input-bg text-card-foreground px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:border-foreground disabled:cursor-not-allowed disabled:opacity-50'

const LISTBOX_ID = 'referral-source-listbox'

export function ReferralStep() {
  const { form } = useMultiStepForm<BusinessDetailsFormData>()
  const [open, setOpen] = React.useState(false)

  const selectedValue = form.watch('referralSource')

  return (
    <StepContainer
      title="How did you hear about us?"
      description="Help us understand how you found Flowglad."
    >
      <FormField
        control={form.control}
        name="referralSource"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  {/* Styled to match SelectTrigger exactly */}
                  <button
                    type="button"
                    role="combobox"
                    aria-expanded={open}
                    aria-haspopup="listbox"
                    aria-controls={LISTBOX_ID}
                    className={selectTriggerClasses}
                  >
                    <span
                      className={cn(
                        'line-clamp-1',
                        !selectedValue && 'text-muted-foreground'
                      )}
                    >
                      {selectedValue ?? 'Select an option'}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput placeholder="Search..." />
                    <CommandList id={LISTBOX_ID} className="max-h-64">
                      <CommandEmpty>No option found.</CommandEmpty>
                      <CommandGroup>
                        {REFERRAL_OPTIONS.map((option) => (
                          <CommandItem
                            key={option}
                            value={option}
                            onSelect={() => {
                              field.onChange(option)
                              setOpen(false)
                            }}
                            className="cursor-pointer"
                          >
                            {option}
                            <Check
                              className={cn(
                                'ml-auto h-4 w-4',
                                field.value === option
                                  ? 'opacity-100'
                                  : 'opacity-0'
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </StepContainer>
  )
}
