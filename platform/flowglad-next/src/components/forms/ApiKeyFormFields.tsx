'use client'

import type { CreateApiKeyInput } from '@db-core/schema/apiKeys'
import { useFormContext } from 'react-hook-form'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import PricingModelSelect from './PricingModelSelect'

const ApiKeyFormFields = () => {
  const form = useFormContext<CreateApiKeyInput>()
  const {
    formState: { errors },
  } = form
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
                className={
                  errors.apiKey?.name?.message
                    ? 'border-destructive focus-visible:ring-destructive'
                    : ''
                }
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <PricingModelSelect
        name="apiKey.pricingModelId"
        control={form.control}
      />
    </div>
  )
}

export default ApiKeyFormFields
