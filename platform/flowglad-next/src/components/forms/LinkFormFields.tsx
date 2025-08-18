'use client'

import { useFormContext } from 'react-hook-form'
import { CreateLinkInput } from '@/db/schema/links'
import { Input } from '@/components/ui/input'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'

interface LinkFormFieldsProps {
  /**
   * Optional base path for the form fields.
   * If not provided, will default to assuming the form fields are nested under `{ link: {...} }`
   * If provided, will assume the form fields are nested under `{ [basePath]: { link: {...} } }`
   * @example
   * <LinkFormFields basePath="offerings.0" />
   * @default
   * null
   */
  basePath?: string
}
const LinkFormFields = ({ basePath }: LinkFormFieldsProps) => {
  const form = useFormContext<CreateLinkInput>()

  return (
    <>
      <FormField
        control={form.control}
        name={
          (basePath
            ? `${basePath}.link.name`
            : 'link.name') as 'link.name'
        }
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input placeholder="Name" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={
          (basePath
            ? `${basePath}.link.url`
            : 'link.url') as 'link.url'
        }
        render={({ field }) => (
          <FormItem>
            <FormLabel>URL</FormLabel>
            <FormControl>
              <Input placeholder="https://..." {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  )
}

export default LinkFormFields
