'use client'

import { Controller, useFormContext } from 'react-hook-form'
import { CreateUsageMeterInput } from '@/db/schema/usageMeters'
import { Input } from '@/components/ui/input'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import PricingModelSelect from './PricingModelSelect'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UsageMeterAggregationType } from '@/types'
import { sentenceCase } from 'change-case'
import core from '@/utils/core'
import { AutoSlugInput } from '@/components/fields/AutoSlugInput'

export default function UsageMeterFormFields({
  edit,
}: {
  edit?: boolean
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
      {!edit && (
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
