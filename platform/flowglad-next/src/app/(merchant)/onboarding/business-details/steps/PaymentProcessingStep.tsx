'use client'

import { StripeConnectContractType } from '@db-core/enums'
import { trpc } from '@/app/_trpc/client'
import { useMultiStepForm } from '@/components/onboarding/MultiStepForm'
import { StepContainer } from '@/components/onboarding/StepContainer'
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form'
import { Label } from '@/components/ui/label'
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { getEligibleFundsFlowsForCountry } from '@/utils/countries'
import { type BusinessDetailsFormData } from './schemas'

export function PaymentProcessingStep() {
  const { form } = useMultiStepForm<BusinessDetailsFormData>()
  const { data: countries } = trpc.countries.list.useQuery()

  const selectedCountryId = form.watch('organization.countryId')
  const selectedCountry = countries?.countries.find(
    (c) => c.id === selectedCountryId
  )

  const eligibleFlows = selectedCountry
    ? getEligibleFundsFlowsForCountry(selectedCountry.code)
    : []

  const options = [
    {
      value: StripeConnectContractType.Platform,
      label: 'Direct Processing',
      description:
        'You are the merchant of record. Process payments directly and handle tax compliance.',
      enabled: eligibleFlows.includes(
        StripeConnectContractType.Platform
      ),
    },
    {
      value: StripeConnectContractType.MerchantOfRecord,
      label: 'Merchant of Record',
      description:
        'Flowglad handles payment processing, tax collection, and compliance.',
      enabled: eligibleFlows.includes(
        StripeConnectContractType.MerchantOfRecord
      ),
    },
  ]

  return (
    <StepContainer
      title="How do you want to process payments?"
      description="Choose how you'd like to handle payment processing and compliance."
    >
      <FormField
        control={form.control}
        name="organization.stripeConnectContractType"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                className="space-y-3"
              >
                {options.map((option) => (
                  <div
                    key={option.value}
                    className={cn(
                      'border rounded-lg p-4 transition-all bg-card-muted',
                      option.enabled
                        ? 'cursor-pointer hover:border-primary'
                        : 'opacity-50 cursor-not-allowed',
                      field.value === option.value &&
                        'border-primary bg-primary/5'
                    )}
                    onClick={() =>
                      option.enabled && field.onChange(option.value)
                    }
                  >
                    <div className="flex items-start gap-3">
                      <RadioGroupItem
                        value={option.value}
                        disabled={!option.enabled}
                      />
                      <div className="space-y-1">
                        <Label className="font-medium">
                          {option.label}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {option.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </StepContainer>
  )
}
