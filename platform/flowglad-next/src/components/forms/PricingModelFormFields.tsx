'use client'

import { Controller } from 'react-hook-form'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormContext,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { CreatePricingModelInput } from '@/db/schema/pricingModels'
import { IntervalUnit } from '@/types'

/**
 * Sentinel value representing non-renewing (one-time payment) behavior.
 * Maps to `undefined` in the form schema.
 */
const NON_RENEWING_VALUE = 'none'

/**
 * Options for the consolidated "Default Product Behavior" dropdown.
 * Combines the previous "Default Plan Behavior" cards with the "Interval" dropdown.
 */
const PRODUCT_BEHAVIOR_OPTIONS = [
  { value: IntervalUnit.Day, label: 'Renews Daily' },
  { value: IntervalUnit.Week, label: 'Renews Weekly' },
  { value: IntervalUnit.Month, label: 'Renews Monthly' },
  { value: IntervalUnit.Year, label: 'Renews Yearly' },
  {
    value: NON_RENEWING_VALUE,
    label: 'Non-Renewing (One-Time Payments)',
  },
] as const

export default function PricingModelFormFields({
  edit,
}: {
  edit?: boolean
}) {
  const form = useFormContext<CreatePricingModelInput>()

  // Convert form value (IntervalUnit | undefined) to dropdown value (string)
  const currentBehavior =
    form.watch('defaultPlanIntervalUnit') ?? NON_RENEWING_VALUE

  const handleBehaviorChange = (value: string) => {
    if (value === NON_RENEWING_VALUE) {
      form.setValue('defaultPlanIntervalUnit', undefined)
    } else {
      form.setValue('defaultPlanIntervalUnit', value as IntervalUnit)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <FormField
          control={form.control}
          name="pricingModel.name"
          render={({ field }: any) => (
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
      {!edit && (
        <FormItem>
          <FormLabel>Default Behavior</FormLabel>
          <FormControl>
            <Select
              value={currentBehavior}
              onValueChange={handleBehaviorChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select behavior" />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_BEHAVIOR_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormControl>
        </FormItem>
      )}
      {!edit && (
        <Controller
          name="pricingModel.isDefault"
          control={form.control}
          render={({ field }: { field: any }) => (
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
                  Make Default
                </label>
                <p className="text-sm text-muted-foreground">
                  New customers will be assigned to this pricing model
                  by default.
                </p>
              </div>
            </div>
          )}
        />
      )}
    </div>
  )
}
