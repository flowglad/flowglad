'use client'

import { AlertCircle, Check, ChevronDown } from 'lucide-react'
import * as React from 'react'
import { trpc } from '@/app/_trpc/client'
import { useMultiStepForm } from '@/components/onboarding/MultiStepForm'
import { StepContainer } from '@/components/onboarding/StepContainer'
import { Button } from '@/components/ui/button'
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
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { isCountryEligibleForAnyFlow } from '@/utils/countries'
import { type BusinessDetailsFormData } from './schemas'

// Match SelectTrigger styling exactly (using bg-input-bg for input background)
const selectTriggerClasses =
  'flex h-12 w-full items-center justify-between whitespace-nowrap rounded border border-input bg-input-bg text-card-foreground px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:border-foreground disabled:cursor-not-allowed disabled:opacity-50'

export function CountryStep() {
  const { form } = useMultiStepForm<BusinessDetailsFormData>()
  const [open, setOpen] = React.useState(false)

  const {
    data: countries,
    isLoading,
    isError,
    refetch,
  } = trpc.countries.list.useQuery()

  const eligibleCountries = (countries?.countries ?? [])
    .filter((country) => isCountryEligibleForAnyFlow(country.code))
    .sort((a, b) => a.name.localeCompare(b.name))

  const selectedCountryId = form.watch('organization.countryId')
  const selectedCountry = eligibleCountries.find(
    (c) => c.id === selectedCountryId
  )

  // Reset selection if country no longer exists in eligible list
  React.useEffect(() => {
    if (selectedCountryId && !isLoading) {
      const countryExists = eligibleCountries.some(
        (c) => c.id === selectedCountryId
      )
      if (!countryExists) {
        form.setValue('organization.countryId', '')
      }
    }
  }, [selectedCountryId, eligibleCountries, isLoading, form])

  // Loading state (preserve existing skeleton layout)
  if (isLoading) {
    return (
      <StepContainer
        title="Where is your business located?"
        description="This determines available payment processing options."
      >
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </StepContainer>
    )
  }

  // Error state
  if (isError) {
    return (
      <StepContainer
        title="Where is your business located?"
        description="This determines available payment processing options."
      >
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <div className="space-y-2">
            <p className="font-medium">Failed to load countries</p>
            <p className="text-sm text-muted-foreground">
              Please check your connection and try again.
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </StepContainer>
    )
  }

  // Edge case: no eligible countries
  if (eligibleCountries.length === 0) {
    return (
      <StepContainer
        title="Where is your business located?"
        description="This determines available payment processing options."
      >
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            No supported countries available. Please contact support.
          </p>
        </div>
      </StepContainer>
    )
  }

  return (
    <StepContainer
      title="Where is your business located?"
      description="This determines available payment processing options."
    >
      <FormField
        control={form.control}
        name="organization.countryId"
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
                    className={selectTriggerClasses}
                  >
                    <span
                      className={cn(
                        'line-clamp-1',
                        !selectedCountry && 'text-muted-foreground'
                      )}
                    >
                      {selectedCountry
                        ? `${selectedCountry.name} (${selectedCountry.code})`
                        : 'Select your country'}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput placeholder="Search countries..." />
                    <CommandList className="max-h-64">
                      <CommandEmpty>No country found.</CommandEmpty>
                      <CommandGroup>
                        {eligibleCountries.map((country) => (
                          <CommandItem
                            key={country.id}
                            value={`${country.name} ${country.code}`}
                            onSelect={() => {
                              field.onChange(country.id)
                              setOpen(false)
                            }}
                            className="cursor-pointer"
                          >
                            {country.name} ({country.code})
                            <Check
                              className={cn(
                                'ml-auto h-4 w-4',
                                field.value === country.id
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
