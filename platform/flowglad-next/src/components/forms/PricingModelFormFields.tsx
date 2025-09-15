'use client'

import { useFormContext } from '@/components/ui/form'
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
import { IntervalUnit } from '@/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card } from '@/registry/components/card'

export default function PricingModelFormFields({ edit }: { edit?: boolean }) {
  const form = useFormContext<CreatePricingModelInput>()
  const isRenewing = Boolean(
    form.watch('defaultPlanIntervalUnit')
  )
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
          <div className="text-sm font-medium text-foreground mb-1">Default Plan Behavior</div>
        </div>
      )}
      {!edit && (
      <div className="grid grid-cols-2 gap-3 overflow-visible">
        <Card
          onClick={chooseRenewing}
          className={
            `cursor-pointer text-left px-4 ${
              isRenewing
                ? 'border-2 border-primary'
                : 'border-border hover:border-primary/50'
            }`
          }
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') chooseRenewing()
          }}
        >
          <div className="font-medium">Renewing</div>
          <div className="text-sm text-muted-foreground">
            Recurring subscription with a billing interval.
          </div>
        </Card>
        <Card
          onClick={chooseNonRenewing}
          className={
            `cursor-pointer text-left px-4 ${
              !isRenewing
                ? 'border-2 border-primary'
                : 'border-border hover-border-primary/50'
            }`
          }
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') chooseNonRenewing()
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
                      <SelectItem value={IntervalUnit.Day}>Day</SelectItem>
                      <SelectItem value={IntervalUnit.Week}>Week</SelectItem>
                      <SelectItem value={IntervalUnit.Month}>Month</SelectItem>
                      <SelectItem value={IntervalUnit.Year}>Year</SelectItem>
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
        <FormField
          control={form.control}
          name="pricingModel.isDefault"
          render={({ field }: any) => (
            <Switch
              checked={field.value}
              onCheckedChange={field.onChange}
              label="Default pricing model"
              description="This become the pricing model that automatically attaches to new customers."
            />
          )}
        />
      )}
    </div>
  )
}
