'use client'
import { useEffect, useState } from 'react'
import { Switch } from '@/components/ui/switch'
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
  const { control, watch, setValue } = usePriceFormContext()
  const trialPeriodDays = watch('price.trialPeriodDays')
  const [offerTrial, setOfferTrial] = useState(
    Boolean(trialPeriodDays && trialPeriodDays > 0)
  )
  useEffect(() => {
    setOfferTrial(Boolean(trialPeriodDays && trialPeriodDays > 0))
  }, [trialPeriodDays, setOfferTrial])
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
    </div>
  )
}

export default TrialFields
