import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import type React from 'react'
import { useFormContext } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
      {selectedArrangement ===
        SubscriptionCancellationArrangement.AtFutureDate && (
        <FormField
          name="cancellation.endDate"
          control={control}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormControl>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !field.value && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {field.value
                        ? format(field.value, 'PPP')
                        : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto p-0"
                    align="start"
                  >
                    <Calendar
                      mode="single"
                      selected={
                        field.value
                          ? new Date(field.value)
                          : undefined
                      }
                      onSelect={(date) =>
                        field.onChange(date?.getTime())
                      }
                      disabled={(date) => date < new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
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
