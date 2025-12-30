'use client'
import { Copy } from 'lucide-react'
import type { useState } from 'react'
import { useEffect } from 'react'
import { useFormContext } from 'react-hook-form'
import { trpc } from '@/app/_trpc/client'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import { CursorLogo } from '@/components/icons/CursorLogo'
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
import {
  REFERRAL_OPTIONS,
  type ReferralOption,
} from '@/utils/referrals'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'

const isReferralOption = (value: string): value is ReferralOption => {
  return REFERRAL_OPTIONS.some((option) => option === value)
}

const OrganizationFormFields = ({
  setReferralSource,
  referralSource,
}: {
  setReferralSource?: ReturnType<
    typeof useState<ReferralOption | undefined>
  >[1]
  referralSource?: ReferralOption
}) => {
  const form = useFormContext<CreateOrganizationInput>()
  const { data: countries } = trpc.countries.list.useQuery()
  const copyPromptHandler = useCopyTextHandler({
    text: analyzeCodebasePrompt,
  })

  const countriesList = countries?.countries ?? []

  const eligibleCountries = countriesList
    .filter((country) => isCountryEligibleForAnyFlow(country.code))
    .sort((a, b) =>
      `${a.name} (${a.code})`.localeCompare(`${b.name} (${b.code})`)
    )

  const selectedCountryId = form.watch('organization.countryId')
  const selectedContractType = form.watch(
    'organization.stripeConnectContractType'
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
    if (core.IS_PROD) {
      if (selectedContractType !== undefined) {
        form.setValue(
          'organization.stripeConnectContractType',
          undefined
        )
      }
      return
    }

    if (!selectedCountry) {
      if (selectedContractType !== undefined) {
        form.setValue(
          'organization.stripeConnectContractType',
          undefined
        )
      }
      return
    }

    if (allowedFlowsForSelectedCountry.length === 1) {
      const onlyAllowedFlow = allowedFlowsForSelectedCountry[0]
      if (selectedContractType !== onlyAllowedFlow) {
        form.setValue(
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
      form.setValue(
        'organization.stripeConnectContractType',
        undefined
      )
    }
  }, [
    allowedFlowsForSelectedCountry,
    form,
    selectedContractType,
    selectedCountry,
  ])

  const platformEnabled = allowedFlowsForSelectedCountry.includes(
    StripeConnectContractType.Platform
  )
  const morEnabled = allowedFlowsForSelectedCountry.includes(
    StripeConnectContractType.MerchantOfRecord
  )

  return (
    <div className="flex flex-col gap-4">
      <FormField
        control={form.control}
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
        control={form.control}
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
                  <SelectValue placeholder="Select Country" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleCountries.map((country) => (
                    <SelectItem key={country.id} value={country.id}>
                      {country.name} ({country.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
            <FormDescription>
              Cannot be changed after organization is created.
            </FormDescription>
          </FormItem>
        )}
      />

      {!core.IS_PROD && selectedCountry ? (
        <FormField
          control={form.control}
          name="organization.stripeConnectContractType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Payment Processing</FormLabel>
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
                    role="button"
                    tabIndex={platformEnabled ? 0 : -1}
                    aria-disabled={!platformEnabled}
                    onClick={() => {
                      if (!platformEnabled) {
                        return
                      }
                      field.onChange(
                        StripeConnectContractType.Platform
                      )
                    }}
                    onKeyDown={(event) => {
                      if (!platformEnabled) {
                        return
                      }
                      if (
                        event.key === 'Enter' ||
                        event.key === ' '
                      ) {
                        event.preventDefault()
                        field.onChange(
                          StripeConnectContractType.Platform
                        )
                      }
                    }}
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
                    role="button"
                    tabIndex={morEnabled ? 0 : -1}
                    aria-disabled={!morEnabled}
                    onClick={() => {
                      if (!morEnabled) {
                        return
                      }
                      field.onChange(
                        StripeConnectContractType.MerchantOfRecord
                      )
                    }}
                    onKeyDown={(event) => {
                      if (!morEnabled) {
                        return
                      }
                      if (
                        event.key === 'Enter' ||
                        event.key === ' '
                      ) {
                        event.preventDefault()
                        field.onChange(
                          StripeConnectContractType.MerchantOfRecord
                        )
                      }
                    }}
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
        control={form.control}
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
                <Copy className="mr-2 h-4 w-4" />
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
                Open in
                <CursorLogo />
              </Button>
            </div>
          </FormItem>
        )}
      />
      {setReferralSource && (
        <FormItem>
          <FormLabel>How did you hear about us?</FormLabel>
          <FormControl>
            <Select
              value={referralSource}
              onValueChange={(val: string) => {
                if (isReferralOption(val)) {
                  setReferralSource(val)
                  return
                }
                setReferralSource(undefined)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {REFERRAL_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormControl>
        </FormItem>
      )}
      {/* FIXME (FG-555): Readd logo upload field once we have a way to upload the logo during organization creation */}
    </div>
  )
}

export default OrganizationFormFields
