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
import { Input } from '@/components/ui/input'
import { usePriceFormContext } from '@/app/hooks/usePriceFormContext'

const TrialFields = ({
  disabled = false,
}: {
  disabled?: boolean
}) => {
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

  // When disabled, force trials off in the form and local UI state
  useEffect(() => {
    if (disabled) {
      setOfferTrial(false)
      setValue('price.trialPeriodDays', 0)
      setValue('price.startsWithCreditTrial', null)
    }
  }, [disabled, setValue])
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center space-x-2">
        <Switch
          id="trial-toggle"
          checked={offerTrial}
          onCheckedChange={(checked) => {
            setOfferTrial(checked)
            if (!checked) {
              setValue('price.trialPeriodDays', 0)
              setValue('price.startsWithCreditTrial', null)
            }
          }}
        />
        <Label
          htmlFor="trial-toggle"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Trial
        </Label>
      </div>
      {offerTrial && (
        <>
          <div>
            <Label className="mb-1">Trial Type</Label>
            <Select
              value={trialType}
              onValueChange={(value) => {
                if (disabled) {
                  return
                }
                setTrialType(value as 'credit' | 'time')
                if (value === 'credit') {
                  setValue('price.startsWithCreditTrial', true)
                } else {
                  setValue('price.startsWithCreditTrial', null)
                }
              }}
            >
              <SelectTrigger disabled={disabled}>
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
                  disabled={!overagePriceId || disabled}
                  description="For one-time credit grant trials. Requires an overage price"
                >
                  Credit
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <FormField
            name="price.trialPeriodDays"
            control={control}
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>Trial Period Days</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    step={1}
                    placeholder="7"
                    value={field.value?.toString() ?? ''}
                    onChange={(e) => {
                      const value = e.target.value
                      const numValue = Number(value)
                      if (!isNaN(numValue)) {
                        field.onChange(numValue)
                      }
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}
    </div>
  )
}

export default TrialFields
