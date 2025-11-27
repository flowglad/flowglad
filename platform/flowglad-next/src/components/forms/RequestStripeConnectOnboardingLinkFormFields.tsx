'use client'

import { Controller, useFormContext } from 'react-hook-form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  Country,
  RequestStripeConnectOnboardingLinkInput,
} from '@/db/schema/countries'

const RequestStripeConnectOnboardingLinkFormFields: React.FC<{
  resumeOnboarding?: boolean
  countries: Country.Record[]
}> = ({ countries }) => {
  const {
    formState: { errors },
    control,
  } = useFormContext<RequestStripeConnectOnboardingLinkInput>()
  const countryOptions = countries
    .map((country) => ({
      label: country.name,
      value: country.id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
  return (
    <Controller
      control={control}
      name="CountryId"
      render={({ field: { value, onChange } }) => (
        <div>
          <Select value={value ?? undefined} onValueChange={onChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select Country" />
            </SelectTrigger>
            <SelectContent>
              {countryOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.CountryId?.message && (
            <p className="text-sm text-destructive mt-1">
              {errors.CountryId?.message}
            </p>
          )}
        </div>
      )}
    />
  )
}

export default RequestStripeConnectOnboardingLinkFormFields
