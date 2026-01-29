'use client'

import { UsageMeterAggregationType } from '@db-core/enums'
import { sentenceCase } from 'change-case'
import { Controller, useFormContext } from 'react-hook-form'
import { AutoSlugInput } from '@/components/fields/AutoSlugInput'
import {
  FormControl,
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
import type { CreateUsageMeterInput } from '@/db/schema/usageMeters'
import core from '@/utils/core'
import PricingModelSelect from './PricingModelSelect'

export default function UsageMeterFormFields({
  edit,
  hidePricingModelSelect,
}: {
  edit?: boolean
  hidePricingModelSelect?: boolean
}) {
  const form = useFormContext<CreateUsageMeterInput>()
  if (!core.IS_PROD) {
    // eslint-disable-next-line no-console
    console.log('errors', form.formState.errors)
  }
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="usageMeter.name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input placeholder="Usage Meter" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {!edit && !hidePricingModelSelect && (
        <div className="w-full relative flex flex-col gap-3">
          <PricingModelSelect
            name="usageMeter.pricingModelId"
            control={form.control}
          />
        </div>
      )}
      <div className="w-full relative flex flex-col gap-3">
        <FormField
          control={form.control}
          name="usageMeter.slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slug</FormLabel>
              <FormControl>
                <AutoSlugInput
                  {...field}
                  name="usageMeter.slug"
                  sourceName="usageMeter.name"
                  placeholder="usage_meter_slug"
                  disabledAuto={edit}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <Controller
        control={form.control}
        name="usageMeter.aggregationType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Aggregation Type</FormLabel>
            <FormControl>
              <Select
                value={field.value}
                onValueChange={field.onChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(UsageMeterAggregationType).map(
                    (type) => (
                      <SelectItem key={type} value={type}>
                        {sentenceCase(type)}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}
