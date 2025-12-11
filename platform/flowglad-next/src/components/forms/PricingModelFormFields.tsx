'use client'

import { Controller } from 'react-hook-form'
import { Card } from '@/components/ui/card'
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

export default function PricingModelFormFields({
  edit,
}: {
  edit?: boolean
}) {
  const form = useFormContext<CreatePricingModelInput>()
  const isRenewing = Boolean(form.watch('defaultPlanIntervalUnit'))
  const chooseRenewing = () => {
    if (!form.getValues('defaultPlanIntervalUnit')) {
      form.setValue('defaultPlanIntervalUnit', IntervalUnit.Month)
    }
  }
  const chooseNonRenewing = () => {
    form.setValue('defaultPlanIntervalUnit', undefined)
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
        <div>
          <div className="text-sm font-medium text-foreground mb-1">
            Default Plan Behavior
          </div>
        </div>
      )}
      {!edit && (
        <div className="grid grid-cols-2 gap-3 overflow-visible">
          <Card
            onClick={chooseRenewing}
            className={`cursor-pointer text-left px-4 ${
              isRenewing
                ? 'border-2 border-primary'
                : 'border-border hover:border-primary/50'
            }`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                chooseRenewing()
              }
            }}
          >
            <div className="font-medium">Renewing</div>
            <div className="text-sm text-muted-foreground">
              Recurring subscription with a billing interval.
            </div>
          </Card>
          <Card
            onClick={chooseNonRenewing}
            className={`cursor-pointer text-left px-4 ${
              !isRenewing
                ? 'border-2 border-primary'
                : 'border-border hover:border-primary/50'
            }`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                chooseNonRenewing()
              }
            }}
          >
            <div className="font-medium">Non-renewing</div>
            <div className="text-sm text-muted-foreground">
              One-time payment with no renewal.
            </div>
          </Card>
        </div>
      )}
      {!edit && isRenewing && (
        <div className="mt-1">
          <FormField
            control={form.control}
            name="defaultPlanIntervalUnit"
            render={({ field }: any) => (
              <FormItem>
                <FormLabel>Interval</FormLabel>
                <FormControl>
                  <Select
                    value={field.value ?? ''}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select interval" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={IntervalUnit.Day}>
                        Day
                      </SelectItem>
                      <SelectItem value={IntervalUnit.Week}>
                        Week
                      </SelectItem>
                      <SelectItem value={IntervalUnit.Month}>
                        Month
                      </SelectItem>
                      <SelectItem value={IntervalUnit.Year}>
                        Year
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
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
                  Default pricing model
                </label>
                <p className="text-xs text-muted-foreground">
                  This becomes the pricing model that automatically
                  attaches to new customers.
                </p>
              </div>
            </div>
          )}
        />
      )}
    </div>
  )
}
