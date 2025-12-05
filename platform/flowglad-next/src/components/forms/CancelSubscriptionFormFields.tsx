import type React from 'react'
import { useFormContext } from 'react-hook-form'
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form'
import { Label } from '@/components/ui/label'
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import type { ScheduleSubscriptionCancellationParams } from '@/subscriptions/schemas'
import { SubscriptionCancellationArrangement } from '@/types'

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
]

const CancelSubscriptionFormFields: React.FC = () => {
  const { control } =
    useFormContext<ScheduleSubscriptionCancellationParams>()

  return (
    <div className={cn('flex flex-col gap-3')}>
      <FormField
        name="cancellation.timing"
        control={control}
        defaultValue={SubscriptionCancellationArrangement.Immediately}
        render={({ field, fieldState }) => (
          <FormItem>
            <FormControl>
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
              >
                {options.map((option) => (
                  <div
                    key={option.value}
                    className="flex items-center gap-3"
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
    </div>
  )
}

export default CancelSubscriptionFormFields
