'use client'
import { IntervalUnit, PriceType } from '@db-core/enums'
import React from 'react'
import { useFormContext } from 'react-hook-form'
import { usePriceFormContext } from '@/app/hooks/usePriceFormContext'
import { AutoSlugInput } from '@/components/fields/AutoSlugInput'
import { CurrencyInput } from '@/components/ui/currency-input'
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
import { useAuthenticatedContext } from '@/contexts/authContext'
import {
  type CreateProductSchema,
  singlePaymentPriceDefaultColumns,
  subscriptionPriceDefaultColumns,
  usagePriceDefaultColumns,
} from '@/db/schema/prices'
import { currencyCharacter } from '@/registry/lib/currency'
import core from '@/utils/core'
import { getPriceConstraints } from '@/utils/priceConstraints'
import { isCurrencyZeroDecimal } from '@/utils/stripe'
import TrialFields from './PriceFormTrialFields'
import UsageMetersSelect from './UsageMetersSelect'

const SubscriptionFields = ({
  defaultPriceLocked,
  omitTrialFields,
  productId,
  edit,
}: {
  defaultPriceLocked: boolean
  omitTrialFields: boolean
  productId?: string
  edit?: boolean
}) => {
  const { control } = usePriceFormContext()
  const { organization } = useAuthenticatedContext()
  const zeroDecimal = isCurrencyZeroDecimal(
    organization!.defaultCurrency
  )
  return (
    <>
      <div className="flex flex-col md:flex-row items-end gap-2.5">
        <FormField
          control={control}
          name="__rawPriceString"
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
                        const zeroValue = zeroDecimal ? '0' : '0.00'
                        field.onChange(zeroValue)
                        return
                      }
                      field.onChange(value)
                    }}
                    allowDecimals={!zeroDecimal}
                    disabled={defaultPriceLocked}
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
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
                  disabled={defaultPriceLocked}
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
      {!omitTrialFields && (
        <TrialFields disabled={defaultPriceLocked} />
      )}
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

const SinglePaymentFields = ({
  defaultPriceLocked,
  edit,
}: {
  defaultPriceLocked: boolean
  edit?: boolean
}) => {
  const { control } = usePriceFormContext()
  const { organization } = useAuthenticatedContext()
  const zeroDecimal = isCurrencyZeroDecimal(
    organization!.defaultCurrency
  )

  return (
    <div className="flex items-end gap-2.5">
      <FormField
        control={control}
        name="__rawPriceString"
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
                  disabled={defaultPriceLocked}
                />
              </FormControl>
            </div>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

const UsageFields = ({
  defaultPriceLocked,
  edit,
  pricingModelId,
  hideUsageMeter,
}: {
  defaultPriceLocked: boolean
  edit?: boolean
  pricingModelId?: string
  hideUsageMeter?: boolean
}) => {
  const {
    control,
    watch,
    setValue,
    formState: { errors },
  } = usePriceFormContext()
  const { organization } = useAuthenticatedContext()
  const zeroDecimal = isCurrencyZeroDecimal(
    organization!.defaultCurrency
  )

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col md:flex-row items-end gap-2.5">
        <FormField
          control={control}
          name="__rawPriceString"
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
                        const zeroValue = zeroDecimal ? '0' : '0.00'
                        field.onChange(zeroValue)
                        return
                      }
                      field.onChange(value)
                    }}
                    allowDecimals={!zeroDecimal}
                    disabled={defaultPriceLocked}
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="price.usageEventsPerUnit"
          control={control}
          render={({ field, fieldState }) => (
            <FormItem className="flex-1">
              <FormLabel>Usage Events Per Unit</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  max={2147483647}
                  step={1}
                  placeholder="e.g. 100"
                  value={field.value?.toString() ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    const numValue = Number(value)
                    if (!isNaN(numValue)) {
                      field.onChange(numValue)
                    }
                  }}
                  disabled={defaultPriceLocked}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      {!hideUsageMeter && (
        <UsageMetersSelect
          name="price.usageMeterId"
          control={control}
          disabled={edit}
          pricingModelId={pricingModelId}
        />
      )}
    </div>
  )
}

const PriceFormFields = ({
  priceOnly,
  edit,
  productId,
  isDefaultProductOverride,
  isDefaultPriceOverride,
  pricingModelId,
  hideUsageMeter,
  disablePriceType,
  hidePriceName,
  hidePriceType,
}: {
  priceOnly?: boolean
  edit?: boolean
  productId?: string
  isDefaultProductOverride?: boolean
  isDefaultPriceOverride?: boolean
  pricingModelId?: string
  hideUsageMeter?: boolean
  disablePriceType?: boolean
  hidePriceName?: boolean
  hidePriceType?: boolean
}) => {
  const {
    control,
    watch,
    setValue,
    formState: { errors },
  } = usePriceFormContext()
  const fullForm = useFormContext<CreateProductSchema>()
  const type = watch('price.type')
  const isDefaultProduct =
    isDefaultProductOverride ??
    fullForm.watch('product')?.default === true
  const isDefaultPrice =
    isDefaultPriceOverride ?? watch('price.isDefault') === true
  const { omitTrialFields, defaultPriceLocked, isDefaultLocked } =
    getPriceConstraints({
      type,
      isDefaultProduct,
      isDefaultPrice,
    })

  let typeFields = <></>

  switch (type) {
    case PriceType.Subscription:
      typeFields = (
        <SubscriptionFields
          productId={productId}
          defaultPriceLocked={defaultPriceLocked}
          omitTrialFields={omitTrialFields}
          edit={edit}
        />
      )
      break
    case PriceType.SinglePayment:
      typeFields = (
        <SinglePaymentFields
          defaultPriceLocked={defaultPriceLocked}
          edit={edit}
        />
      )
      break
    case PriceType.Usage:
      typeFields = (
        <UsageFields
          defaultPriceLocked={defaultPriceLocked}
          edit={edit}
          pricingModelId={pricingModelId}
          hideUsageMeter={hideUsageMeter}
        />
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
      {priceOnly && isDefaultLocked && (
        <p className="text-xs text-muted-foreground">
          Amount, trial settings, name, slug, type, and default status
          are locked for the default price of a default plan.
        </p>
      )}
      {priceOnly && edit && !isDefaultLocked && (
        <p className="text-xs text-muted-foreground">
          Price type, amount, interval, trial settings, usage events
          per unit, and usage meter cannot be edited after creation to
          maintain billing consistency.
        </p>
      )}
      {!hidePriceType && (
        <FormField
          control={control}
          name="price.type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Price Type</FormLabel>
              <FormControl>
                <Select
                  value={
                    isDefaultProduct
                      ? (field.value ?? PriceType.Subscription)
                      : field.value
                  }
                  onValueChange={(value) => {
                    /**
                     * When price type changes,
                     * set default values for the new price type to ensure
                     * that the price will parse correctly.
                     */
                    if (value === PriceType.Usage) {
                      Object.entries(
                        usagePriceDefaultColumns
                      ).forEach(assignPriceValueFromTuple)
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
                  disabled={
                    edit || isDefaultLocked || disablePriceType
                  }
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
                    {/* Usage price type is excluded from product forms */}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>
                What type of payment the user will make
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      {typeFields}
    </div>
  )
}

export default PriceFormFields
