'use client'
import { useEffect, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import NumberInput from '@/components/ion/NumberInput'
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
            <Label className="mb-1">Trial Type</Label>
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
                <SelectValue placeholder="Select trial type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value="time"
                  description="For trials with a set number of days."
                >
                  Time
                </SelectItem>
                <SelectItem
                  value="credit"
                  disabled={!overagePriceId}
                  description="For one-time credit grant trials. Requires an overage price"
                >
                  Credit
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {trialType === 'time' && (
            <FormField
              name="price.trialPeriodDays"
              control={control}
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Trial Period Days</FormLabel>
                  <FormControl>
                    <NumberInput
                      {...field}
                      onChange={undefined}
                      onValueChange={({ floatValue }) => {
                        field.onChange(floatValue ?? undefined)
                      }}
                      min={1}
                      max={365}
                      step={1}
                      error={fieldState.error?.message}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </>
      )}
    </div>
  )
}

export default TrialFields
