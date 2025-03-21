'use client'

import { useFormContext, Controller } from 'react-hook-form'
import { CreateDiscountInput } from '@/db/schema/discounts'
import Input from '@/components/ion/Input'
import { Select } from '@/components/ion/Select'
import { DiscountAmountType, DiscountDuration } from '@/types'
import NumberInput from '@/components/ion/NumberInput'
import StatusBadge from '@/components/StatusBadge'
import Switch from '@/components/ion/Switch'
import Label from '@/components/ion/Label'
import { ControlledCurrencyInput } from './ControlledCurrencyInput'
import { Percent } from 'lucide-react'

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
    register,
  } = form
  const duration = watch('discount.duration')
  const amountType = watch('discount.amountType')
  const discount = watch('discount')
  console.log('===discount', discount)
  console.log('===errors', errors)
  return (
    <div className="space-y-4">
      <Input
        label="Name"
        placeholder="Your Discount's Name"
        {...register('discount.name')}
      />
      <Input
        label="Code"
        placeholder="Your Discount's Code"
        {...register('discount.code')}
        onBlur={() => {
          const value = form.getValues('discount.code')
          form.setValue('discount.code', value.toUpperCase())
        }}
      />
      <div className="flex gap-4">
        <Controller
          control={control}
          name="discount.amountType"
          render={({ field }) => (
            <Select
              label="Type"
              options={[
                {
                  label: 'Fixed',
                  value: DiscountAmountType.Fixed,
                },
                {
                  label: 'Percentage',
                  value: DiscountAmountType.Percent,
                },
              ]}
              error={errors.discount?.amountType?.message}
              value={field.value ?? DiscountAmountType.Fixed}
              onValueChange={(value) => {
                form.setValue('discount.amount', 0)
                field.onChange(value)
              }}
              className="flex-1"
            />
          )}
        />
        {amountType === DiscountAmountType.Percent ? (
          <Controller
            control={control}
            name="discount.amount"
            render={({ field }) => {
              return (
                <NumberInput
                  {...field}
                  label="Amount"
                  className="flex-1"
                  showControls={false}
                  iconTrailing={<Percent size={16} />}
                />
              )
            }}
          />
        ) : (
          <ControlledCurrencyInput
            label="Amount"
            name="discount.amount"
            control={control}
            className="flex-1"
          />
        )}
      </div>
      <Controller
        control={control}
        name="discount.duration"
        render={({ field }) => (
          <Select
            label="Duration"
            options={[
              {
                label: 'Once',
                value: DiscountDuration.Once,
              },
              {
                label: 'Recurring',
                value: DiscountDuration.NumberOfPayments,
              },
              {
                label: 'Forever',
                value: DiscountDuration.Forever,
              },
            ]}
            error={errors.discount?.duration?.message}
            value={field.value ?? DiscountDuration.Once}
            onValueChange={(value) => {
              if (value !== DiscountDuration.NumberOfPayments) {
                form.setValue('discount.numberOfPayments', null)
              }
              field.onChange(value)
            }}
            className="flex-1"
          />
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
          <Label>Status</Label>
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
