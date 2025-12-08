'use client'
import { Copy } from 'lucide-react'
import type { useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CreateOrganizationInput } from '@/db/schema/organizations'
import analyzeCodebasePrompt from '@/prompts/analyze-codebase.md'
import { cursorDeepLink } from '@/utils/cursor'
import {
  REFERRAL_OPTIONS,
  type ReferralOption,
} from '@/utils/referrals'
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
