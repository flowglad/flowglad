'use client'

import { AlertCircle } from 'lucide-react'
import * as React from 'react'
import { trpc } from '@/app/_trpc/client'
import { useMultiStepForm } from '@/components/onboarding/MultiStepForm'
import { StepContainer } from '@/components/onboarding/StepContainer'
import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form'
import {
  ResponsiveCombobox,
  type ResponsiveComboboxOption,
} from '@/components/ui/responsive-combobox'
import { Skeleton } from '@/components/ui/skeleton'
import { isCountryEligibleForAnyFlow } from '@/utils/countries'
import { type BusinessDetailsFormData } from './schemas'

export function CountryStep() {
  const { form } = useMultiStepForm<BusinessDetailsFormData>()

  const {
    data: countries,
    isLoading,
    isError,
    refetch,
  } = trpc.countries.list.useQuery()

  const eligibleCountries = (countries?.countries ?? [])
    .filter((country) => isCountryEligibleForAnyFlow(country.code))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Transform countries to ResponsiveCombobox options format
  const countryOptions: ResponsiveComboboxOption[] = React.useMemo(
    () =>
      eligibleCountries.map((country) => ({
        value: country.id,
        label: `${country.name} (${country.code})`,
        searchValue: `${country.name} ${country.code}`,
      })),
    [eligibleCountries]
  )

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
              <ResponsiveCombobox
                options={countryOptions}
                value={field.value}
                onValueChange={field.onChange}
                placeholder="Select your country"
                searchPlaceholder="Search countries..."
                emptyText="No country found."
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </StepContainer>
  )
}
