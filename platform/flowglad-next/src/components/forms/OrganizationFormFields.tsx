'use client'
import { Copy } from 'lucide-react'
import { useEffect, type useState } from 'react'
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
import { cursorDeepLink } from '@/utils/cursor'
import {
  REFERRAL_OPTIONS,
  type ReferralOption,
} from '@/utils/referrals'
import {
  getEligibleFundsFlowsForCountry,
  isCountryEligibleForAnyFlow,
} from '@/utils/stripeConnectEligibility'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'

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

  const selectedCountryId = form.watch('organization.countryId')
  const selectedStripeConnectContractType = form.watch(
    'organization.stripeConnectContractType'
  )

  const countryRecords = countries?.countries ?? []
  const selectedCountry = countryRecords.find(
    (country) => country.id === selectedCountryId
  )
  const eligibleFlows = selectedCountry
    ? getEligibleFundsFlowsForCountry(selectedCountry.code)
    : []

  useEffect(() => {
    if (!core.IS_DEV) {
      return
    }
    if (!selectedCountry) {
      if (selectedStripeConnectContractType) {
        form.setValue(
          'organization.stripeConnectContractType',
          undefined
        )
      }
      return
    }

    if (eligibleFlows.length === 0) {
      if (selectedStripeConnectContractType) {
        form.setValue(
          'organization.stripeConnectContractType',
          undefined
        )
      }
      return
    }

    if (eligibleFlows.length === 1) {
      const onlyEligibleFlow = eligibleFlows[0]
      if (selectedStripeConnectContractType !== onlyEligibleFlow) {
        form.setValue(
          'organization.stripeConnectContractType',
          onlyEligibleFlow
        )
      }
      return
    }

    if (
      selectedStripeConnectContractType &&
      !eligibleFlows.includes(selectedStripeConnectContractType)
    ) {
      form.setValue(
        'organization.stripeConnectContractType',
        undefined
      )
    }
  }, [
    eligibleFlows,
    form,
    selectedCountry,
    selectedStripeConnectContractType,
  ])

  const countryOptions =
    countryRecords
      .filter((country) => isCountryEligibleForAnyFlow(country.code))
      .map((country) => ({
        label: country.name,
        value: country.id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)) ?? []

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
            <FormDescription>
              This cannot be changed after you create your
              organization.
            </FormDescription>
            <FormControl>
              <Select
                value={field.value ? field.value : undefined}
                onValueChange={field.onChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Country" />
                </SelectTrigger>
                <SelectContent>
                  {countryOptions.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
            <FormDescription>
              Used to determine your default currency
            </FormDescription>
          </FormItem>
        )}
      />
      {core.IS_DEV && selectedCountry && (
        <FormField
          control={form.control}
          name="organization.stripeConnectContractType"
          render={({ field }) => {
            const isPlatformEligible = eligibleFlows.includes(
              StripeConnectContractType.Platform
            )
            const isMorEligible = eligibleFlows.includes(
              StripeConnectContractType.MerchantOfRecord
            )

            return (
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
                    className="flex flex-col gap-3"
                  >
                    <div
                      className={cn(
                        'border rounded-lg p-4',
                        isPlatformEligible
                          ? 'cursor-pointer'
                          : 'opacity-50 cursor-not-allowed'
                      )}
                      onClick={() => {
                        if (isPlatformEligible) {
                          field.onChange(
                            StripeConnectContractType.Platform
                          )
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <RadioGroupItem
                          value={StripeConnectContractType.Platform}
                          id="stripe-contract-platform"
                          disabled={!isPlatformEligible}
                        />
                        <div className="flex flex-col gap-1">
                          <Label
                            htmlFor="stripe-contract-platform"
                            className="font-medium"
                          >
                            Direct Processing
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            You are the merchant of record. You
                            process payments directly and handle tax
                            compliance. Customers will see your
                            business name on their statements.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div
                      className={cn(
                        'border rounded-lg p-4',
                        isMorEligible
                          ? 'cursor-pointer'
                          : 'opacity-50 cursor-not-allowed'
                      )}
                      onClick={() => {
                        if (isMorEligible) {
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
                          id="stripe-contract-mor"
                          disabled={!isMorEligible}
                        />
                        <div className="flex flex-col gap-1">
                          <Label
                            htmlFor="stripe-contract-mor"
                            className="font-medium"
                          >
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
            )
          }}
        />
      )}
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
              onValueChange={(val: string) =>
                setReferralSource(val as ReferralOption)
              }
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
