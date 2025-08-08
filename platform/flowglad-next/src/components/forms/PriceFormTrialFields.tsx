'use client'
import { useEffect, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
          <div>
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-1">
              Trial Type
            </label>
            <Select
              value={trialType}
              onValueChange={(value) => {
                setTrialType(value as 'credit' | 'time')
                if (value === 'credit') {
                  setValue('price.startsWithCreditTrial', true)
                } else {
                  setValue('price.startsWithCreditTrial', null)
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="time">
                  <div>
                    <div>Time</div>
                    <div className="text-xs text-muted-foreground">
                      For trials with a set number of days.
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="credit" disabled={!overagePriceId}>
                  <div>
                    <div>Credit</div>
                    <div className="text-xs text-muted-foreground">
                      For one-time credit grant trials. Requires an
                      overage price
                    </div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
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
