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
          <div className="flex items-center space-x-2">
            <Switch
              id="is-default"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
            <div className="grid gap-1.5 leading-none">
              <label
                htmlFor="is-default"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Default pricing model
              </label>
              <p className="text-xs text-muted-foreground">
                This become the pricing model that automatically
                attaches to new customers.
              </p>
            </div>
          </div>
        )}
      />
    </div>
  )
}
