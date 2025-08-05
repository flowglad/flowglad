'use client'
import { useEffect, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import Select from '@/components/ion/Select'
import NumberInput from '@/components/ion/NumberInput'
import { Controller, FieldError } from 'react-hook-form'
import { usePriceFormContext } from '@/app/hooks/usePriceFormContext'

const TrialFields = () => {
  const {
    formState: { errors },
    control,
    watch,
    setValue,
  } = usePriceFormContext()
  const trialPeriodDays = watch('price.trialPeriodDays')
  const startsWithCreditTrial = watch('price.startsWithCreditTrial')
  const overagePriceId = watch('price.overagePriceId')
  const [offerTrial, setOfferTrial] = useState(
    Boolean(trialPeriodDays && trialPeriodDays > 0)
  )
  useEffect(() => {
    if (startsWithCreditTrial) {
      setOfferTrial(true)
    } else {
      setOfferTrial(Boolean(trialPeriodDays && trialPeriodDays > 0))
    }
  }, [trialPeriodDays, startsWithCreditTrial, setOfferTrial])
  const [trialType, setTrialType] = useState<'credit' | 'time'>(
    overagePriceId || startsWithCreditTrial ? 'credit' : 'time'
  )

  useEffect(() => {
    if (startsWithCreditTrial) {
      setTrialType('credit')
    } else {
      setTrialType(overagePriceId ? 'credit' : 'time')
    }
  }, [overagePriceId, startsWithCreditTrial, setTrialType])
  return (
    <div className="flex flex-col gap-2.5">
      <Switch
        label="Trial"
        checked={offerTrial}
        onCheckedChange={(checked) => {
          setOfferTrial(checked)
          if (!checked) {
            setValue('price.trialPeriodDays', 0)
            setValue('price.startsWithCreditTrial', null)
          }
        }}
      />
      {offerTrial && (
        <>
          <Select
            label="Trial Type"
            options={[
              {
                label: 'Time',
                value: 'time',
                description: 'For trials with a set number of days.',
              },
              {
                label: 'Credit',
                value: 'credit',
                disabled: !overagePriceId,
                description:
                  'For one-time credit grant trials. Requires an overage price',
              },
            ]}
            value={trialType}
            onValueChange={(value) => {
              setTrialType(value as 'credit' | 'time')
              if (value === 'credit') {
                setValue('price.startsWithCreditTrial', true)
              } else {
                setValue('price.startsWithCreditTrial', null)
              }
            }}
          />
          {trialType === 'time' && (
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
                    (errors.price?.trialPeriodDays as FieldError)
                      ?.message
                  }
                />
              )}
            />
          )}
        </>
      )}
    </div>
  )
}

export default TrialFields
