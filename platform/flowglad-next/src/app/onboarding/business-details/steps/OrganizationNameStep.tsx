'use client'

import { useEffect } from 'react'
import { trpc } from '@/app/_trpc/client'
import { useMultiStepForm } from '@/components/onboarding/MultiStepForm'
import { StepContainer } from '@/components/onboarding/StepContainer'
import { StepNavigation } from '@/components/onboarding/StepNavigation'
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { type BusinessDetailsFormData } from './schemas'

export function OrganizationNameStep() {
  const { form } = useMultiStepForm<BusinessDetailsFormData>()
  const utils = trpc.useUtils()

  // Prefetch countries while user fills organization name
  // This ensures the next step loads instantly
  useEffect(() => {
    utils.countries.list.prefetch()
  }, [utils])

  return (
    <StepContainer
      title="What's your organization called?"
      description="This is how your business will appear to customers."
    >
      <FormField
        control={form.control}
        name="organization.name"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <Input
                {...field}
                placeholder="Acme Inc."
                autoFocus
                className="text-lg h-12"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <StepNavigation nextLabel="Next" />
    </StepContainer>
  )
}
