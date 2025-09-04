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
import NumberInput from '@/components/ion/NumberInput'
import StatusBadge from '@/components/StatusBadge'
import { Switch } from '@/components/ui/switch'

import { Percent } from 'lucide-react'
import { core } from '@/utils/core'
import { CurrencyInput } from '../ion/CurrencyInput'
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
  if (!core.IS_PROD) {
    // eslint-disable-next-line no-console
    console.log('===errors', errors)
  }
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
                <NumberInput
                  value={field.value?.toString() ?? ''}
                  label="Amount"
                  className="flex-1"
                  showControls={false}
                  onValueChange={(value) => {
                    field.onChange(value.floatValue)
                  }}
                  error={parseError ?? logicError}
                  max={100}
                  min={0}
                  iconTrailing={<Percent size={16} />}
                />
              )
            }}
          />
        ) : (
          <Controller
            control={control}
            name="discount.amount"
            render={({ field }) => (
              <CurrencyInput
                value={field.value?.toString() ?? ''}
                onValueChange={(value) => {
                  if (value.floatValue) {
                    field.onChange(
                      humanReadableCurrencyAmountToStripeCurrencyAmount(
                        organization!.defaultCurrency,
                        Math.ceil(value.floatValue * 100) / 100
                      )
                    )
                  } else {
                    field.onChange(0)
                  }
                }}
                className="flex-1"
                label="Amount"
              />
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
        <Controller
          control={control}
          name="discount.numberOfPayments"
          render={({ field }) => {
            return (
              <NumberInput
                label="Number of Payments"
                placeholder="10"
                onValueChange={(value) => {
                  field.onChange(value.floatValue)
                }}
                defaultValue={1}
                max={10000000000}
                min={1}
                step={1}
                showControls={false}
                error={errors.discount?.numberOfPayments?.message}
              />
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
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                label={
                  <div className="cursor-pointer w-full">
                    {field.value ? (
                      <StatusBadge active={true} />
                    ) : (
                      <StatusBadge active={false} />
                    )}
                  </div>
                }
              />
            )}
          />
        </div>
      )}
    </div>
  )
}
