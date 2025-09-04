'use client'

import { useFormContext, Controller } from 'react-hook-form'
import { CreateDiscountInput } from '@/db/schema/discounts'
import { Input } from '@/components/ui/input'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DiscountAmountType, DiscountDuration } from '@/types'
import StatusBadge from '@/components/StatusBadge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

import { Percent } from 'lucide-react'
import { core } from '@/utils/core'
import { DollarSign } from 'lucide-react'
import { humanReadableCurrencyAmountToStripeCurrencyAmount } from '@/utils/stripe'
import { useAuthenticatedContext } from '@/contexts/authContext'

export default function DiscountFormFields({
  edit = false,
}: {
  edit?: boolean
}) {
  const form = useFormContext<CreateDiscountInput>()
  const {
    formState: { errors },
    watch,
    control,
  } = form
  const duration = watch('discount.duration')
  const amountType = watch('discount.amountType')
  const discount = watch('discount')
  const { organization } = useAuthenticatedContext()
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
      <div className="flex gap-4">
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
                    form.setValue('discount.amount', 0)
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
              const parseError = errors.discount?.amount?.message
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
                  <FormControl>
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        placeholder="0"
                        className="pr-10 text-right"
                        value={field.value?.toString() ?? ''}
                        onChange={(e) => {
                          const value = e.target.value
                          const floatValue = parseFloat(value)
                          if (!isNaN(floatValue)) {
                            field.onChange(floatValue)
                          } else {
                            field.onChange(null)
                          }
                        }}
                      />
                      <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    </div>
                  </FormControl>
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
            name="discount.amount"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>Amount</FormLabel>
                <FormControl>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      className="pl-10 text-right"
                      value={
                        field.value
                          ? (field.value / 100).toFixed(2)
                          : ''
                      }
                      onChange={(e) => {
                        const value = e.target.value
                        if (value) {
                          const floatValue = parseFloat(value)
                          if (!isNaN(floatValue)) {
                            field.onChange(
                              humanReadableCurrencyAmountToStripeCurrencyAmount(
                                organization!.defaultCurrency,
                                Math.ceil(floatValue * 100) / 100
                              )
                            )
                          }
                        } else {
                          field.onChange(0)
                        }
                      }}
                    />
                  </div>
                </FormControl>
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
                  {field.value ? (
                    <StatusBadge active={true} />
                  ) : (
                    <StatusBadge active={false} />
                  )}
                </Label>
              </div>
            )}
          />
        </div>
      )}
    </div>
  )
}
