'use client'
import { useEffect, useState } from 'react'
import Label from '@/components/ion/Label'
import { FeatureFlag, IntervalUnit, PriceType } from '@/types'
import { Switch } from '@/components/ui/switch'
import { CurrencyInput } from '@/components/ion/CurrencyInput'
import Select from '@/components/ion/Select'
import {
  singlePaymentPriceDefaultColumns,
  subscriptionPriceDefaultColumns,
  usagePriceDefaultColumns,
} from '@/db/schema/prices'
import { Controller, FieldError } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { ControlledCurrencyInput } from './ControlledCurrencyInput'
import { hasFeatureFlag } from '@/utils/organizationHelpers'
import { useAuthContext } from '@/contexts/authContext'
import UsageMetersSelect from './UsageMetersSelect'
import { core } from '@/utils/core'
import { usePriceFormContext } from '@/app/hooks/usePriceFormContext'
import { RecurringUsageCreditsOveragePriceSelect } from './OveragePriceSelect'
import TrialFields from './PriceFormTrialFields'

const SubscriptionFields = ({
  omitTrialFields = false,
  productId,
}: {
  omitTrialFields?: boolean
  productId?: string
}) => {
  const {
    formState: { errors },
    control,
    watch,
  } = usePriceFormContext()

  return (
    <>
      <div className="flex items-end gap-2.5">
        <ControlledCurrencyInput
          name="price.unitPrice"
          control={control}
          label="Amount"
          className="flex-1"
        />
        <FormField
          control={control}
          name="price.intervalUnit"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>Per</FormLabel>
              <FormControl>
                <Select
                  placeholder="Select interval"
                  options={[
                    { label: 'Day', value: IntervalUnit.Day },
                    { label: 'Week', value: IntervalUnit.Week },
                    { label: 'Month', value: IntervalUnit.Month },
                    { label: 'Year', value: IntervalUnit.Year },
                  ]}
                  className="flex-1"
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      {productId && (
        <RecurringUsageCreditsOveragePriceSelect
          productId={productId}
        />
      )}
      {!omitTrialFields && <TrialFields />}
    </>
  )
}

// const InstallmentsFields = () => {
//   const {
//     formState: { errors },
//     control,
//   } = usePriceFormContext()
//   return (
//     <div className="flex items-end gap-2.5">
//       <Controller
//         name="price.totalInstallmentsAmount"
//         control={control}
//         render={({ field }) => (
//           <CurrencyInput
//             {...field}
//             label="Total Amount"
//             className="flex-1"
//             error={(errors.price?.unitPrice as FieldError)?.message}
//           />
//         )}
//       />
//       <Controller
//         name="price.firstInstallmentAmount"
//         control={control}
//         render={({ field }) => (
//           <CurrencyInput
//             {...field}
//             label="First Installment"
//             className="flex-1"
//             error={(errors.price?.firstInstallmentAmount as FieldError)?.message}
//           />
//         )}
//       />
//     </div>
//   )
// }

const SinglePaymentFields = () => {
  const {
    formState: { errors },
    control,
  } = usePriceFormContext()
  return (
    <div className="flex items-end gap-2.5">
      <FormField
        control={control}
        name="price.unitPrice"
        render={({ field }) => (
          <FormItem className="flex-1">
            <FormLabel>Amount</FormLabel>
            <FormControl>
              <CurrencyInput {...field} className="flex-1" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

const PriceFormFields = ({
  priceOnly,
  edit,
  productId,
}: {
  priceOnly?: boolean
  edit?: boolean
  productId?: string
}) => {
  const {
    control,
    watch,
    setValue,
    formState: { errors },
  } = usePriceFormContext()
  const type = watch('price.type')
  let typeFields = <></>
  const { organization } = useAuthContext()
  const hasUsage = hasFeatureFlag(organization, FeatureFlag.Usage)
  if (!core.IS_PROD) {
    // eslint-disable-next-line no-console
    console.log('===errors', errors)
  }

  switch (type) {
    case PriceType.Subscription:
      typeFields = <SubscriptionFields productId={productId} />
      break
    case PriceType.SinglePayment:
      typeFields = <SinglePaymentFields />
      break
    case PriceType.Usage:
      typeFields = (
        <div className="flex flex-col gap-2.5">
          <SubscriptionFields omitTrialFields />
          <UsageMetersSelect
            name="price.usageMeterId"
            control={control}
          />
        </div>
      )
      break
  }

  const assignPriceValueFromTuple = (tuple: [string, any]) => {
    const [key, value] = tuple
    // @ts-expect-error - key is a valid key of usagePriceDefaultColumns
    setValue(`price.${key}`, value)
  }

  return (
    <div className="flex-1 w-full relative flex flex-col justify-center gap-6">
      {priceOnly && (
        <FormField
          control={control}
          name="price.name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Price Name</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      <FormField
        control={control}
        name="price.slug"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Price Slug</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} />
            </FormControl>
            <FormDescription>
              The slug is used to identify the price in the API. It
              must be unique within the catalog.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="price.type"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Price Type</FormLabel>
            <FormControl>
              <Select
                value={field.value}
                onValueChange={(value) => {
                  /**
                   * When price type changes,
                   * set default values for the new price type to ensure
                   * that the price will parse correctly.
                   */
                  if (value === PriceType.Usage) {
                    Object.entries(usagePriceDefaultColumns).forEach(
                      assignPriceValueFromTuple
                    )
                  }
                  if (value === PriceType.SinglePayment) {
                    Object.entries(
                      singlePaymentPriceDefaultColumns
                    ).forEach(assignPriceValueFromTuple)
                  }
                  if (value === PriceType.Subscription) {
                    Object.entries(
                      subscriptionPriceDefaultColumns
                    ).forEach(assignPriceValueFromTuple)
                  }
                  field.onChange(value)
                }}
                disabled={edit}
                hint="What type of payment the user will make. Cannot be edited after creation."
                options={[
                  {
                    label: 'Single Payment',
                    value: PriceType.SinglePayment,
                  },
                  {
                    label: 'Subscription',
                    value: PriceType.Subscription,
                  },
                  ...(hasUsage
                    ? [
                        {
                          label: 'Usage',
                          value: PriceType.Usage,
                        },
                      ]
                    : []),
                ]}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {typeFields}
      {priceOnly && (
        <FormField
          control={control}
          name="price.isDefault"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Default</FormLabel>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  )
}
export default PriceFormFields
