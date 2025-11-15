'use client'
import { useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { CreateOrganizationInput } from '@/db/schema/organizations'
import { Input } from '@/components/ui/input'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  REFERRAL_OPTIONS,
  type ReferralOption,
} from '@/utils/referrals'
import { trpc } from '@/app/_trpc/client'
import FileInput from '@/components/FileInput'
import { Textarea } from '../ui/textarea'
import { Button } from '../ui/button'
import analyzeCodebasePrompt from '@/prompts/analyze-codebase'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import { cursorDeepLink } from '@/utils/cursor'

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

  const countryOptions =
    countries?.countries
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
            <FormControl>
              <Select
                value={field.value ?? undefined}
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
      <FormField
        control={form.control}
        name="codebaseMarkdown"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Codebase Overview</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                value={field.value ?? ''}
                onChange={field.onChange}
              />
            </FormControl>
            <FormDescription>
              Optional. A detailed overview of your codebase. This
              will be used to generate integration guides for your
              pricing models.
            </FormDescription>
            <Button
              variant="link"
              type="button"
              onClick={copyPromptHandler}
            >
              Copy analysis prompt
            </Button>
            <Button
              variant="link"
              type="button"
              onClick={() => {
                window.open(
                  cursorDeepLink(analyzeCodebasePrompt),
                  '_blank'
                )
              }}
            >
              Open analysis prompt in Cursor
            </Button>
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

      <FormField
        control={form.control}
        name="organization.logoURL"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Company logo</FormLabel>
            <FormControl>
              <FileInput
                directory="organizations"
                singleOnly
                id="organization-logo-upload"
                fileTypes={[
                  'png',
                  'jpeg',
                  'jpg',
                  'gif',
                  'webp',
                  'svg',
                  'avif',
                ]}
                initialURL={field.value ?? undefined}
                onUploadComplete={({ publicURL }) =>
                  field.onChange(publicURL)
                }
                onUploadDeleted={() => field.onChange(undefined)}
                hint="Recommended square image. Max size 2MB."
              />
            </FormControl>
            <FormDescription>
              This logo appears in your dashboard navigation and
              customer-facing invoices.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

export default OrganizationFormFields
