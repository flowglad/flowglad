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
            if (disabled) {
              return
            }
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
      )}
    </div>
  )
}

export default TrialFields
