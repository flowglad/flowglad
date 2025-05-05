'use client'
import { useEffect, useState } from 'react'
import Label from '@/components/ion/Label'
import {
  RadioGroup,
  RadioGroupItem as Radio,
} from '@/components/ion/Radio'
import { FeatureFlag, IntervalUnit, PriceType } from '@/types'
import Switch from '@/components/ion/Switch'
import { CurrencyInput } from '@/components/ion/CurrencyInput'
import Select from '@/components/ion/Select'
import NumberInput from '@/components/ion/NumberInput'
import { CreateProductSchema } from '@/db/schema/prices'
import {
  Controller,
  FieldError,
  useFormContext,
} from 'react-hook-form'
import Input from '@/components/ion/Input'
import { ControlledCurrencyInput } from './ControlledCurrencyInput'
import Hint from '../ion/Hint'
import { hasFeatureFlag } from '@/utils/organizationHelpers'
import { useAuthContext } from '@/contexts/authContext'
import { isPriceTypeSubscription } from '@/db/tableMethods/priceMethods'
import UsageMetersSelect from './UsageMetersSelect'
import { core } from '@/utils/core'

const usePriceFormContext = () => {
  return useFormContext<Pick<CreateProductSchema, 'price'>>()
}

const TrialPeriodFields = () => {
  const {
    formState: { errors },
    control,
    watch,
    setValue,
  } = usePriceFormContext()
  const trialPeriodDays = watch('price.trialPeriodDays')
  console.log('form.price.trialPeriodDays', trialPeriodDays)
  console.log('price values', watch('price'))
  const [offerTrial, setOfferTrial] = useState(
    Boolean(trialPeriodDays && trialPeriodDays > 0)
  )
  useEffect(() => {
    setOfferTrial(Boolean(trialPeriodDays && trialPeriodDays > 0))
  }, [trialPeriodDays])
  if (!core.IS_PROD) {
    console.log('===errors', errors)
  }
  return (
    <>
      <Switch
        label="Trial period"
        checked={offerTrial}
        onCheckedChange={(checked) => {
          setOfferTrial(checked)
          if (!checked) {
            setValue('price.trialPeriodDays', 0)
          }
        }}
      />
      {offerTrial && (
        <Controller
          name="price.trialPeriodDays"
          control={control}
          render={({ field }) => (
            <NumberInput
              {...field}
              onChange={(e) => {
                field.onChange(Number(e.target.value))
              }}
              label="Trial Period Days"
              min={1}
              max={365}
              step={1}
              error={
                (errors.price?.trialPeriodDays as FieldError)?.message
              }
            />
          )}
        />
      )}
    </>
  )
}

const SubscriptionFields = ({
  omitTrialPeriodFields = false,
}: {
  omitTrialPeriodFields?: boolean
}) => {
  const {
    formState: { errors },
    control,
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
        <Controller
          name="price.intervalUnit"
          control={control}
          render={({ field }) => (
            <Select
              label="Per"
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
              error={
                (errors.price?.intervalUnit as FieldError)?.message
              }
            />
          )}
        />
      </div>
      {!omitTrialPeriodFields && <TrialPeriodFields />}
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
//             label="First Installment Amount"
//             className="flex-1"
//             error={
//               (errors.price?.firstInstallmentAmount as FieldError)
//                 ?.message
//             }
//           />
//         )}
//       />
//     </div>
//   )
// }

const SinglePaymentFields = () => {
  const { control } = usePriceFormContext()
  return (
    <Controller
      name="price.unitPrice"
      control={control}
      render={({ field }) => (
        <CurrencyInput {...field} label="Amount" defaultValue={0} />
      )}
    />
  )
}

const PriceFormFields = ({
  priceOnly,
  edit,
}: {
  priceOnly?: boolean
  edit?: boolean
}) => {
  const {
    control,
    watch,
    setValue,
    register,
    formState: { errors },
  } = usePriceFormContext()
  const type = watch('price.type')
  let typeFields = <></>
  const { organization } = useAuthContext()
  const hasUsage = hasFeatureFlag(organization, FeatureFlag.Usage)
  switch (type) {
    case PriceType.Subscription:
      typeFields = <SubscriptionFields />
      break
    case PriceType.SinglePayment:
      typeFields = <SinglePaymentFields />
      break
    case PriceType.Usage:
      typeFields = (
        <div className="flex flex-col gap-2.5">
          <SubscriptionFields omitTrialPeriodFields />
          <UsageMetersSelect
            name="price.usageMeterId"
            control={control}
          />
        </div>
      )
      break
  }
  return (
    <div className="flex-1 w-full relative flex flex-col justify-center gap-6">
      {priceOnly && (
        <Input
          label="Price Name"
          {...register('price.name')}
          error={errors.price?.name?.message}
        />
      )}

      <div className="w-full relative flex flex-col gap-3">
        <Label>Price Type</Label>
        <Controller
          name="price.type"
          control={control}
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              orientation="horizontal"
              onValueChange={(value) => {
                if (isPriceTypeSubscription(value as PriceType)) {
                  setValue('price.intervalCount', 1)
                  setValue('price.intervalUnit', IntervalUnit.Month)
                  setValue('price.setupFeeAmount', null)
                }
                if (value === PriceType.SinglePayment) {
                  setValue('price.intervalCount', null)
                  setValue('price.intervalUnit', null)
                  setValue('price.usageMeterId', null)
                  setValue('price.trialPeriodDays', null)
                }
                if (value !== PriceType.Usage) {
                  setValue('price.usageMeterId', null)
                }
                field.onChange(value)
              }}
              disabled={edit}
              disabledTooltip="You can't change price type after creating a price"
            >
              <div className="w-full relative flex items-start gap-5">
                <Radio
                  label="Single Payment"
                  value={PriceType.SinglePayment}
                />
                <Radio
                  label="Subscription"
                  value={PriceType.Subscription}
                />
                {hasUsage && (
                  <Radio label="Usage" value={PriceType.Usage} />
                )}
              </div>
            </RadioGroup>
          )}
        />
        <Hint>
          What type of payment the user will make. Cannot be edited
          after creation.
        </Hint>
      </div>
      {typeFields}
      {priceOnly && (
        <div className="w-full relative flex flex-col gap-3">
          <Controller
            name="price.isDefault"
            control={control}
            render={({ field }) => (
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                label="Default"
              />
            )}
          />
        </div>
      )}
    </div>
  )
}
export default PriceFormFields
