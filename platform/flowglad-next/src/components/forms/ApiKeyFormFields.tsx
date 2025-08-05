'use client'

import { useFormContext } from 'react-hook-form'
import { CreateApiKeyInput } from '@/db/schema/apiKeys'
import { Input } from '@/components/ui/input'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'

const ApiKeyFormFields = () => {
  const form = useFormContext<CreateApiKeyInput>()
  return (
    <div className="flex flex-col gap-4">
      <FormField
        control={form.control}
        name="apiKey.name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input
                placeholder="e.g. Production API Key"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

export default ApiKeyFormFields
