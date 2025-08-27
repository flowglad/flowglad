'use client'

import { useFormContext, Controller } from 'react-hook-form'
import { CreatePricingModelInput } from '@/db/schema/pricingModels'
import { Input } from '@/components/ui/input'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'

export default function PricingModelFormFields() {
  const form = useFormContext<CreatePricingModelInput>()
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <FormField
          control={form.control}
          name="pricingModel.name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  id="name"
                  placeholder="Pricing model name"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <Controller
        name="pricingModel.isDefault"
        control={form.control}
        render={({ field }) => (
          <Switch
            checked={field.value}
            onCheckedChange={field.onChange}
            label="Default pricing model"
            description="This become the pricing model that automatically attaches to new customers."
          />
        )}
      />
    </div>
  )
}
