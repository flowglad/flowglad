'use client'

import { Percent } from 'lucide-react'
import { Controller, useFormContext } from 'react-hook-form'
import PricingModelSelect from '@/components/forms/PricingModelSelect'
import { CurrencyInput } from '@/components/ui/currency-input'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ActiveStatusTag,
  booleanToActiveStatus,
} from '@/components/ui/status-tag'
import { Switch } from '@/components/ui/switch'
import { useAuthenticatedContext } from '@/contexts/authContext'
import {
  type CreateDiscountFormSchema,
  CreateDiscountInput,
} from '@/db/schema/discounts'
import { currencyCharacter } from '@/registry/lib/currency'
import { DiscountAmountType, DiscountDuration } from '@/types'
import { core } from '@/utils/core'
import { isCurrencyZeroDecimal } from '@/utils/stripe'

export default function DiscountFormFields({
  edit = false,
}: {
  edit?: boolean
}) {
  const form = useFormContext<CreateDiscountFormSchema>()
  const {
    formState: { errors },
    watch,
    control,
  } = form
  const duration = watch('discount.duration')
  const amountType = watch('discount.amountType')
  const discount = watch('discount')
  const { organization } = useAuthenticatedContext()
  const zeroDecimal = isCurrencyZeroDecimal(
    organization!.defaultCurrency
  )
  return (
    <div className="space-y-4">
      <FormField
        control={control}
        name="discount.name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input placeholder="Your Discount's Name" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="discount.code"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Code</FormLabel>
            <FormControl>
              <Input
                placeholder="Your Discount's Code"
                {...field}
                onBlur={() => {
                  field.onBlur()
                  const value = form.getValues('discount.code')

                  form.setValue('discount.code', value.toUpperCase())
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {!edit && (
        <PricingModelSelect
          name="discount.pricingModelId"
          control={control}
        />
      )}
      <div className="flex flex-col md:flex-row gap-4">
        <Controller
          control={control}
          name="discount.amountType"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>Type</FormLabel>
              <FormControl>
                <Select
                  value={field.value ?? DiscountAmountType.Fixed}
                  onValueChange={(value) => {
                    if (value === DiscountAmountType.Percent) {
                      form.setValue('discount.amount', 1)
                      // Clear raw amount string when switching to percent
                      form.setValue(
                        '__rawAmountString',
                        undefined as any
                      )
                    } else {
                      form.setValue('__rawAmountString', '0')
                      // Remove amount when switching to fixed
                      form.setValue(
                        'discount.amount',
                        undefined as any
                      )
                    }
                    field.onChange(value)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DiscountAmountType.Fixed}>
                      Fixed
                    </SelectItem>
                    <SelectItem value={DiscountAmountType.Percent}>
                      Percentage
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {amountType === DiscountAmountType.Percent ? (
          <Controller
            control={control}
            name="discount.amount"
            render={({ field }) => {
              const amountFieldState =
                form.getFieldState('discount.amount')
              const parseError =
                (amountFieldState.error?.message as
                  | string
                  | undefined) || undefined
              const moreThan100 = field.value && field.value > 100
              const lessThan0 = field.value && field.value < 0
              let logicError: string | undefined
              if (moreThan100) {
                logicError = 'Amount must be less than 100'
              }
              if (lessThan0) {
                logicError = 'Amount must be greater than 0'
              }
              return (
                <FormItem className="flex-1">
                  <FormLabel>Amount</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        step={1}
                        placeholder="1"
                        className="pr-10 text-right"
                        value={field.value?.toString() ?? ''}
                        onChange={(e) => {
                          const value = e.target.value
                          const intValue = parseInt(value)
                          if (!isNaN(intValue)) {
                            field.onChange(intValue)
                          } else {
                            field.onChange('')
                          }
                        }}
                      />
                    </FormControl>
                    <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                  {(parseError ?? logicError) && (
                    <FormMessage>
                      {parseError ?? logicError}
                    </FormMessage>
                  )}
                </FormItem>
              )
            }}
          />
        ) : (
          <FormField
            control={control}
            name="__rawAmountString"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>Amount</FormLabel>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {currencyCharacter(organization!.defaultCurrency)}
                  </span>
                  <FormControl>
                    <CurrencyInput
                      value={field.value?.toString() ?? ''}
                      onValueChange={(value) => {
                        if (!value) {
                          field.onChange('0')
                          return
                        }
                        field.onChange(value)
                      }}
                      allowDecimals={!zeroDecimal}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>
      <Controller
        control={control}
        name="discount.duration"
        render={({ field }) => (
          <FormItem className="flex-1">
            <FormLabel>Duration</FormLabel>
            <FormControl>
              <Select
                value={field.value ?? DiscountDuration.Once}
                onValueChange={(value) => {
                  if (value !== DiscountDuration.NumberOfPayments) {
                    form.setValue('discount.numberOfPayments', null)
                  }
                  field.onChange(value)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DiscountDuration.Once}>
                    Once
                  </SelectItem>
                  <SelectItem
                    value={DiscountDuration.NumberOfPayments}
                  >
                    Recurring
                  </SelectItem>
                  <SelectItem value={DiscountDuration.Forever}>
                    Forever
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {duration === DiscountDuration.NumberOfPayments && (
        <FormField
          control={control}
          name="discount.numberOfPayments"
          render={({ field }) => {
            return (
              <FormItem>
                <FormLabel>Number of Payments</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={10000000000}
                    step={1}
                    placeholder="10"
                    defaultValue={1}
                    value={field.value?.toString() ?? ''}
                    onChange={(e) => {
                      const value = e.target.value
                      const floatValue = parseFloat(value)
                      if (!isNaN(floatValue)) {
                        field.onChange(floatValue)
                      } else {
                        field.onChange(1)
                      }
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )
          }}
        />
      )}
      {edit && (
        <div className="w-full relative flex flex-col gap-3">
          <FormLabel>Status</FormLabel>
          <Controller
            name="discount.active"
            control={control}
            render={({ field }) => (
              <div className="flex items-center space-x-2">
                <Switch
                  id="discount-active"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label
                  htmlFor="discount-active"
                  className="cursor-pointer w-full"
                >
                  <ActiveStatusTag
                    status={booleanToActiveStatus(
                      field.value ?? false
                    )}
                  />
                </Label>
              </div>
            )}
          />
        </div>
      )}
    </div>
  )
}
