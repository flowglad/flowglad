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
import { Textarea } from '../ui/textarea'
import { Button } from '../ui/button'
import analyzeCodebasePrompt from '@/prompts/analyze-codebase.md'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import { cursorDeepLink } from '@/utils/cursor'
import { Copy } from 'lucide-react'

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
                <svg
                  width="69"
                  height="16"
                  viewBox="0 0 69 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="ml-2 h-4 !w-auto"
                >
                  <path
                    d="M6.71094 0.0888672C6.91735 -0.0298614 7.17245 -0.0297649 7.37891 0.0888672L13.8096 3.78711C13.9831 3.88691 14.0907 4.0719 14.0908 4.27148V11.7285C14.0908 11.9283 13.9839 12.113 13.8105 12.2129L7.37891 15.9111C7.17254 16.0297 6.91828 16.0297 6.71191 15.9111L0.28125 12.2129C0.107658 12.1131 0 11.9282 0 11.7285V4.27148C7.57216e-05 4.0716 0.107719 3.88691 0.28125 3.78711L6.71094 0.0888672ZM0.791992 4.22852C0.708064 4.22852 0.678521 4.33906 0.750977 4.38086L6.84766 7.88672C6.96955 7.95704 7.04483 8.08653 7.04492 8.22656V15.2393C7.04492 15.3229 7.15628 15.3524 7.19824 15.2803L13.4062 4.57031C13.494 4.41828 13.384 4.22867 13.208 4.22852H0.791992ZM28.1094 8.90137C28.1094 10.1368 28.6773 10.7139 30.0107 10.7139C31.3441 10.7138 31.912 10.1371 31.9121 8.90137V3.94727H33.6055V9.24707C33.6055 11.0486 32.4573 12.1924 30.0107 12.1924C27.5642 12.1924 26.4161 11.0377 26.416 9.23633V3.94727H28.1094V8.90137ZM55.5068 3.80762C58.0575 3.80762 59.6699 5.43603 59.6699 7.98828C59.6699 10.5406 57.9882 12.1924 55.4375 12.1924C52.8869 12.1923 51.2754 10.5405 51.2754 7.98828C51.2755 5.43614 52.9563 3.80776 55.5068 3.80762ZM25.0244 5.44824H22.3809C20.9547 5.44824 19.8419 6.26875 19.8418 8.00098C19.842 9.73301 20.9548 10.5527 22.3809 10.5527H25.0244V12.0547H22.1719C19.7835 12.0546 18.0909 10.6569 18.0908 8.00098C18.0909 5.34501 19.8995 3.94728 22.2881 3.94727H25.0244V5.44824ZM50.2656 5.40234H46.2305C45.6512 5.40249 45.2805 5.7024 45.2803 6.2793C45.2803 6.85649 45.6625 7.13424 46.2422 7.18066L48.1562 7.34277C49.6052 7.46976 50.5555 8.12792 50.5557 9.6748C50.5557 11.2222 49.5473 12.0547 48.1211 12.0547H43.7842V10.5996H47.959C48.5037 10.5995 48.8516 10.2292 48.8516 9.68652C48.8515 9.10932 48.4802 8.86631 47.9238 8.82031L46.0459 8.64746C44.4227 8.49742 43.5763 7.86197 43.5762 6.32617C43.5762 4.79029 44.6197 3.94727 46.1152 3.94727H50.2656V5.40234ZM39.9004 3.94727C41.431 3.94727 42.4511 4.72067 42.4512 6.24512C42.451 7.14564 41.9299 7.83821 41.2344 8.13867V8.16211C41.9647 8.26627 42.3352 8.78589 42.3467 9.49023L42.3818 12.0537H40.6895L40.6543 9.76758C40.6428 9.25949 40.3411 8.94727 39.7383 8.94727H36.9209V12.0537H35.2285V3.94727H39.9004ZM65.5137 3.94727C67.0441 3.94737 68.0644 4.72077 68.0645 6.24512C68.0643 7.14573 67.5423 7.83826 66.8467 8.13867V8.16211C67.5771 8.26619 67.9484 8.78582 67.96 9.49023L67.9941 12.0537H66.3018L66.2666 9.76758C66.2551 9.25949 65.9534 8.94727 65.3506 8.94727H62.5332V12.0537H60.8408V3.94727H65.5137ZM55.4717 5.28613C54.0226 5.28635 53.0255 6.2911 53.0254 8C53.0255 9.70881 54.0226 10.7136 55.4717 10.7139C56.921 10.7139 57.9188 9.709 57.9189 8C57.9189 6.29091 56.9211 5.28613 55.4717 5.28613ZM36.9209 7.5498H39.7031C40.3407 7.5498 40.7471 7.1687 40.7471 6.47559C40.7469 5.78319 40.3759 5.40243 39.6807 5.40234H36.9209V7.5498ZM62.5332 7.5498H65.3164C65.9537 7.54961 66.3594 7.16853 66.3594 6.47559C66.3592 5.78312 65.9884 5.40234 65.293 5.40234H62.5332V7.5498Z"
                    fill="currentColor"
                  />
                </svg>
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
