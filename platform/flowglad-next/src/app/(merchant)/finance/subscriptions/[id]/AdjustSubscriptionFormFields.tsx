'use client'

import { type CurrencyCode } from '@db-core/enums'
import type { Price } from '@db-core/schema/prices'
import { useFormContext } from 'react-hook-form'
import {
  FormControl,
  FormDescription,
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
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { SubscriptionAdjustmentTiming } from '@/types'
import { getCurrencyParts } from '@/utils/stripe'
import type { AdjustSubscriptionFormValues } from './adjustSubscriptionFormSchema'

interface AdjustSubscriptionFormFieldsProps {
  availablePrices: Price.ClientRecord[]
  currentPriceId?: string
  currency?: CurrencyCode
}

const timingOptions = [
  {
    label: 'Auto',
    value: SubscriptionAdjustmentTiming.Auto,
    description:
      'Upgrades happen immediately, downgrades at end of billing period',
  },
  {
    label: 'Immediately',
    value: SubscriptionAdjustmentTiming.Immediately,
    description: 'Change takes effect now (with proration)',
  },
  {
    label: 'End of Billing Period',
    value: SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
    description: 'Change takes effect at the next billing date',
  },
]

export const AdjustSubscriptionFormFields = ({
  availablePrices,
  currentPriceId,
  currency = 'usd' as CurrencyCode,
}: AdjustSubscriptionFormFieldsProps) => {
  const form = useFormContext<AdjustSubscriptionFormValues>()
  const selectedTiming = form.watch('timing')
  const showProrationToggle =
    selectedTiming === SubscriptionAdjustmentTiming.Immediately ||
    selectedTiming === SubscriptionAdjustmentTiming.Auto

  const formatPrice = (price: Price.ClientRecord) => {
    if (!('unitPrice' in price)) return 'Usage-based'
    const { symbol, value } = getCurrencyParts(
      currency,
      price.unitPrice,
      {
        hideZeroCents: true,
      }
    )
    const interval = price.intervalUnit
      ? `/${price.intervalCount === 1 ? '' : price.intervalCount}${price.intervalUnit}`
      : ''
    return `${symbol}${value}${interval}`
  }

  return (
    <div className={cn('flex flex-col gap-6')}>
      {/* Plan Selection */}
      <FormField
        name="priceId"
        control={form.control}
        render={({ field }) => (
          <FormItem>
            <FormLabel>New Plan</FormLabel>
            <FormControl>
              <Select
                value={field.value}
                onValueChange={field.onChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  {availablePrices.map((price) => (
                    <SelectItem key={price.id} value={price.id}>
                      <span className="flex items-center gap-2">
                        <span>{price.name || price.id}</span>
                        <span className="text-muted-foreground">
                          {formatPrice(price)}
                        </span>
                        {price.id === currentPriceId && (
                          <span className="text-xs text-muted-foreground">
                            (current)
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Quantity */}
      <FormField
        name="quantity"
        control={form.control}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Quantity</FormLabel>
            <FormControl>
              <Input
                type="number"
                min={1}
                {...field}
                onChange={(e) =>
                  field.onChange(parseInt(e.target.value, 10) || 1)
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Timing */}
      <FormField
        name="timing"
        control={form.control}
        render={({ field }) => {
          const selectedOption = timingOptions.find(
            (opt) => opt.value === field.value
          )
          return (
            <FormItem>
              <FormLabel>
                When should this change take effect?
              </FormLabel>
              <FormControl>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select timing">
                      {selectedOption?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {timingOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        textValue={option.label}
                      >
                        <div className="flex flex-col items-start py-1">
                          <span className="font-medium">
                            {option.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )
        }}
      />

      {/* Proration Toggle */}
      {showProrationToggle && (
        <FormField
          name="prorateCurrentBillingPeriod"
          control={form.control}
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel>Prorate charges</FormLabel>
                <FormDescription>
                  Charge/credit the customer for time remaining in the
                  current billing period
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />
      )}
    </div>
  )
}
