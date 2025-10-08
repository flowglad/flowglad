'use client'
import { CurrencyInput } from '@/components/ui/currency-input'
import { IntervalUnit, PriceType } from '@/types'
import { Switch } from '@/components/ui/switch'
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
import { Input } from '@/components/ui/input'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { useAuthenticatedContext } from '@/contexts/authContext'
import UsageMetersSelect from './UsageMetersSelect'
import { usePriceConstraints } from '@/app/hooks/usePriceConstraints'
import core from '@/utils/core'
import { usePriceFormContext } from '@/app/hooks/usePriceFormContext'
import { useFormContext } from 'react-hook-form'
import { CreateProductSchema } from '@/db/schema/prices'
import TrialFields from './PriceFormTrialFields'
import { isCurrencyZeroDecimal } from '@/utils/stripe'
import { currencyCharacter } from '@/registry/lib/currency'
import { AutoSlugInput } from '@/components/fields/AutoSlugInput'

const SubscriptionFields = ({
  defaultPriceLocked,
  omitTrialFields,
  productId,
}: {
  defaultPriceLocked: boolean
  omitTrialFields: boolean
  productId?: string
}) => {
  const { control } = usePriceFormContext()
  const { organization } = useAuthenticatedContext()
  const zeroDecimal = isCurrencyZeroDecimal(
    organization!.defaultCurrency
  )
  return (
    <>
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
}: {
  defaultPriceLocked: boolean
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

const PriceFormFields = ({
  priceOnly,
  edit,
  productId,
  isDefaultProductOverride,
  isDefaultPriceOverride,
}: {
  priceOnly?: boolean
  edit?: boolean
  productId?: string
  isDefaultProductOverride?: boolean
  isDefaultPriceOverride?: boolean
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
    usePriceConstraints({
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
        />
      )
      break
    case PriceType.SinglePayment:
      typeFields = (
        <SinglePaymentFields
          defaultPriceLocked={defaultPriceLocked}
        />
      )
      break
    case PriceType.Usage:
      typeFields = (
        <div className="flex flex-col gap-2.5">
          <SubscriptionFields
            defaultPriceLocked={defaultPriceLocked}
            omitTrialFields={omitTrialFields}
          />
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
      {priceOnly && isDefaultLocked && (
        <p className="text-xs text-muted-foreground">
          Amount, trial settings, name, slug, type, and default status
          are locked for the default price of a default plan.
        </p>
      )}
      {priceOnly && (
        <FormField
          control={control}
          name="price.name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Price Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Price"
                  {...field}
                  value={field.value ?? ''}
                  disabled={isDefaultProduct && isDefaultPrice}
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
              <AutoSlugInput
                {...field}
                name="price.slug"
                sourceName={priceOnly ? 'price.name' : 'product.name'}
                placeholder="price_slug"
                disabledAuto={edit || isDefaultLocked}
                disabled={isDefaultLocked}
              />
            </FormControl>
            <FormDescription>
              The slug is used to identify the price in the API. Must
              be unique per-pricing model.
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
                disabled={edit || isDefaultLocked}
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
                  <SelectItem value={PriceType.Usage}>
                    Usage
                  </SelectItem>
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
                  disabled={isDefaultLocked}
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
