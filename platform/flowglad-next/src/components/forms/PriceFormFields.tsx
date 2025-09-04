'use client'
import { useEffect, useState, useRef } from 'react'

import { FeatureFlag, IntervalUnit, PriceType } from '@/types'
import { snakeCase } from 'change-case'
import { Switch } from '@/components/ui/switch'
import { CurrencyInput } from '@/components/ion/CurrencyInput'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { hasFeatureFlag } from '@/utils/organizationHelpers'
import { useAuthenticatedContext } from '@/contexts/authContext'
import UsageMetersSelect from './UsageMetersSelect'
import { core } from '@/utils/core'
import { usePriceFormContext } from '@/app/hooks/usePriceFormContext'
import { RecurringUsageCreditsOveragePriceSelect } from './OveragePriceSelect'
import TrialFields from './PriceFormTrialFields'
import { humanReadableCurrencyAmountToStripeCurrencyAmount } from '@/utils/stripe'

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
  const { organization } = useAuthenticatedContext()
  return (
    <>
      <div className="flex items-end gap-2.5">
        <Controller
          control={control}
          name="price.unitPrice"
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
        <FormField
          control={control}
          name="price.intervalUnit"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>Per</FormLabel>
              <FormControl>
                <Select
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger className="flex-1">
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
  const isPriceSlugDirty = useRef(false)
  let typeFields = <></>
  const { organization } = useAuthenticatedContext()
  const hasUsage = hasFeatureFlag(organization, FeatureFlag.Usage)
  if (!core.IS_PROD) {
    const price = watch('price')
    console.log('===price', price)
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
                <Input
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) => {
                    // First, let the field handle its own onChange
                    field.onChange(e)

                    // Then handle our auto-slug logic
                    const newName = e.target.value

                    // Only auto-generate slug if the price slug field is not dirty
                    if (!isPriceSlugDirty.current && newName.trim()) {
                      const newSlug = snakeCase(newName)
                      setValue('price.slug', newSlug)
                    } else if (
                      !isPriceSlugDirty.current &&
                      !newName.trim()
                    ) {
                      // If name is empty, also clear the slug
                      setValue('price.slug', '')
                    }
                  }}
                />
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
              <Input
                {...field}
                value={field.value ?? ''}
                onFocus={() => {
                  isPriceSlugDirty.current = true
                }}
                onChange={(e) => {
                  isPriceSlugDirty.current = true
                  field.onChange(e)
                }}
              />
            </FormControl>
            <FormDescription>
              The slug is used to identify the price in the API. It
              must be unique within the pricing model.
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
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PriceType.SinglePayment}>
                    Single Payment
                  </SelectItem>
                  <SelectItem value={PriceType.Subscription}>
                    Subscription
                  </SelectItem>
                  {hasUsage && (
                    <SelectItem value={PriceType.Usage}>
                      Usage
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </FormControl>
            <FormDescription>
              What type of payment the user will make. Cannot be
              edited after creation.
            </FormDescription>
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
