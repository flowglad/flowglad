'use client'

import { Copy } from 'lucide-react'
import { useEffect } from 'react'
import { useFormContext } from 'react-hook-form'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import { CursorLogo } from '@/components/icons/CursorLogo'
import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Country } from '@/db/schema/countries'
import type { CreateOrganizationInput } from '@/db/schema/organizations'
import { cn } from '@/lib/utils'
import analyzeCodebasePrompt from '@/prompts/analyze-codebase.md'
import { StripeConnectContractType } from '@/types'
import core from '@/utils/core'
import {
  getEligibleFundsFlowsForCountry,
  isCountryEligibleForAnyFlow,
} from '@/utils/countries'
import { cursorDeepLink } from '@/utils/cursor'

const countryDisplayName = (country: Country.Record) =>
  `${country.name} (${country.code})`

/**
 * Onboarding-only organization fields that must be set at org creation time
 * (country + funds flow are immutable).
 */
const OrganizationOnboardingFormFields = ({
  countries,
}: {
  countries: Country.Record[]
}) => {
  const { control, watch, setValue } =
    useFormContext<CreateOrganizationInput>()

  const selectedCountryId = watch('organization.countryId')
  const selectedContractType = watch(
    'organization.stripeConnectContractType'
  )

  const eligibleCountries = countries
    .filter((country) => isCountryEligibleForAnyFlow(country.code))
    .sort((a, b) =>
      countryDisplayName(a).localeCompare(countryDisplayName(b))
    )

  const selectedCountry = eligibleCountries.find(
    (country) => country.id === selectedCountryId
  )

  const eligibleFlowsForSelectedCountry = selectedCountry
    ? getEligibleFundsFlowsForCountry(selectedCountry.code)
    : []

  const allowedFlowsForSelectedCountry = core.IS_PROD
    ? eligibleFlowsForSelectedCountry.filter(
        (flow) => flow === StripeConnectContractType.Platform
      )
    : eligibleFlowsForSelectedCountry

  useEffect(() => {
    if (!selectedCountry) {
      if (selectedContractType !== undefined) {
        setValue('organization.stripeConnectContractType', undefined)
      }
      return
    }

    if (allowedFlowsForSelectedCountry.length === 1) {
      const onlyAllowedFlow = allowedFlowsForSelectedCountry[0]
      if (selectedContractType !== onlyAllowedFlow) {
        setValue(
          'organization.stripeConnectContractType',
          onlyAllowedFlow
        )
      }
      return
    }

    if (
      selectedContractType &&
      !allowedFlowsForSelectedCountry.includes(selectedContractType)
    ) {
      setValue('organization.stripeConnectContractType', undefined)
    }
  }, [
    allowedFlowsForSelectedCountry,
    selectedContractType,
    selectedCountry,
    setValue,
  ])

  const copyPromptHandler = useCopyTextHandler({
    text: analyzeCodebasePrompt,
  })

  const platformEnabled = allowedFlowsForSelectedCountry.includes(
    StripeConnectContractType.Platform
  )
  const morEnabled = allowedFlowsForSelectedCountry.includes(
    StripeConnectContractType.MerchantOfRecord
  )

  return (
    <div className="flex flex-col gap-6">
      <FormField
        control={control}
        name="organization.name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Organization Name</FormLabel>
            <FormControl>
              <Input placeholder="Your Company" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="organization.countryId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Country</FormLabel>
            <FormControl>
              <Select
                value={field.value ?? undefined}
                onValueChange={field.onChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select your country" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleCountries.map((country) => (
                    <SelectItem key={country.id} value={country.id}>
                      {countryDisplayName(country)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
            <FormDescription>
              This cannot be changed after you create your
              organization.
            </FormDescription>
          </FormItem>
        )}
      />

      {selectedCountry ? (
        <FormField
          control={control}
          name="organization.stripeConnectContractType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Payment Processing</FormLabel>
              <FormDescription>
                This cannot be changed after you create your
                organization.
              </FormDescription>
              <FormControl>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <div
                    className={cn(
                      'border rounded-lg p-4',
                      platformEnabled
                        ? 'cursor-pointer'
                        : 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <RadioGroupItem
                        value={StripeConnectContractType.Platform}
                        id="stripeConnectContractType-platform"
                        disabled={!platformEnabled}
                      />
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="stripeConnectContractType-platform">
                          Direct Processing
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          You are the merchant of record. You process
                          payments directly and handle tax compliance.
                          Customers will see your business name on
                          their statements.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div
                    className={cn(
                      'border rounded-lg p-4',
                      morEnabled
                        ? 'cursor-pointer'
                        : 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <RadioGroupItem
                        value={
                          StripeConnectContractType.MerchantOfRecord
                        }
                        id="stripeConnectContractType-mor"
                        disabled={!morEnabled}
                      />
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="stripeConnectContractType-mor">
                          Merchant of Record
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Flowglad is the merchant of record. We
                          handle payment processing, tax collection,
                          and compliance. Customers will see
                          &quot;Flowglad&quot; on their statements.
                          All transactions are in USD.
                        </p>
                        {core.IS_PROD ? (
                          <p className="text-sm text-muted-foreground">
                            Merchant-of-record is not available in
                            production yet.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}

      <FormField
        control={control}
        name="codebaseMarkdown"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Codebase Overview</FormLabel>
            <div className="text-sm text-muted-foreground !mt-0 pb-1 max-w-[300px]">
              Quickly integrate by copying and pasting prompts about
              your codebase.
            </div>
            <FormControl>
              <Textarea
                {...field}
                value={field.value ?? ''}
                onChange={field.onChange}
                placeholder="Paste codebase analysis here..."
              />
            </FormControl>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyPromptHandler}
              >
                <Copy className="h-4 w-4" />
                Copy Prompt
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  window.open(
                    cursorDeepLink(analyzeCodebasePrompt),
                    '_blank',
                    'noopener,noreferrer'
                  )
                }}
              >
                Open in <CursorLogo />
              </Button>
            </div>
          </FormItem>
        )}
      />
    </div>
  )
}

export default OrganizationOnboardingFormFields
