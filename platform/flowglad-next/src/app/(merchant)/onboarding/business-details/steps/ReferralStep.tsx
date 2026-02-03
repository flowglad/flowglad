'use client'

import * as React from 'react'
import { useMultiStepForm } from '@/components/onboarding/MultiStepForm'
import { StepContainer } from '@/components/onboarding/StepContainer'
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
import { REFERRAL_OPTIONS } from '@/utils/referrals'
import { type BusinessDetailsFormData } from './schemas'

const LISTBOX_ID = 'referral-source-listbox'

// Transform referral options to ResponsiveCombobox format
const referralOptions: ResponsiveComboboxOption[] =
  REFERRAL_OPTIONS.map((option) => ({
    value: option,
    label: option,
  }))

export function ReferralStep() {
  const { form } = useMultiStepForm<BusinessDetailsFormData>()

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
              <ResponsiveCombobox
                options={referralOptions}
                value={field.value}
                onValueChange={field.onChange}
                placeholder="Select an option"
                searchPlaceholder="Search..."
                emptyText="No option found."
                listboxId={LISTBOX_ID}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </StepContainer>
  )
}
