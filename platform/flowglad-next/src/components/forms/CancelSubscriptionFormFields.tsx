import React from 'react'
import { useFormContext } from 'react-hook-form'
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group'
import { SubscriptionCancellationArrangement } from '@/types'
import { Label } from '@/components/ui/label'
import Datepicker from '@/components/ion/Datepicker'
import { cn } from '@/utils/core'
import { ScheduleSubscriptionCancellationParams } from '@/subscriptions/schemas'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'

// Define the available radio options
const options = [
  {
    label: 'Immediately',
    value: SubscriptionCancellationArrangement.Immediately,
  },
  {
    label: 'At End Of Current Billing Period',
    value:
      SubscriptionCancellationArrangement.AtEndOfCurrentBillingPeriod,
  },
  {
    label: 'At Future Date',
    value: SubscriptionCancellationArrangement.AtFutureDate,
  },
]

const CancelSubscriptionFormFields: React.FC = () => {
  const { control, watch } =
    useFormContext<ScheduleSubscriptionCancellationParams>()
  const selectedArrangement = watch('cancellation.timing')

  return (
    <div
      className={cn(
        'flex flex-col gap-3',
        selectedArrangement ===
          SubscriptionCancellationArrangement.AtFutureDate &&
          'min-h-[500px]'
      )}
    >
      <FormField
        name="cancellation.timing"
        control={control}
        defaultValue={SubscriptionCancellationArrangement.Immediately}
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>Timing</FormLabel>
            <FormControl>
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
              >
                {options.map((option) => (
                  <div
                    key={option.value}
                    className="flex items-center space-x-2"
                  >
                    <RadioGroupItem
                      value={option.value}
                      id={option.value}
                    />
                    <Label htmlFor={option.value}>
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {selectedArrangement ===
        SubscriptionCancellationArrangement.AtFutureDate && (
        <FormField
          name="cancellation.endDate"
          control={control}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>End Date</FormLabel>
              <FormControl>
                <Datepicker
                  {...field}
                  minDate={new Date()}
                  onSelect={(value) => field.onChange(value)}
                  value={field.value || undefined}
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

export default CancelSubscriptionFormFields
