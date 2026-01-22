import { sentenceCase } from 'change-case'
import { AlertTriangle } from 'lucide-react'
import type React from 'react'
import { useFormContext } from 'react-hook-form'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ClonePricingModelInput } from '@/db/schema/pricingModels'
import { DestinationEnvironment } from '@/types'

interface ClonePricingModelFormFieldsProps {
  hasLivemodePricingModel?: boolean
}

const ClonePricingModelFormFields: React.FC<
  ClonePricingModelFormFieldsProps
> = ({ hasLivemodePricingModel = false }) => {
  const form = useFormContext<ClonePricingModelInput>()
  const selectedDestination = form.watch('destinationEnvironment')

  // Show warning if user is about to clone to livemode but already has one
  const showLivemodeWarning =
    hasLivemodePricingModel &&
    selectedDestination === DestinationEnvironment.Livemode

  return (
    <div className="flex flex-col gap-3">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Pricing Model Name</FormLabel>
            <FormControl>
              <Input
                placeholder="Enter pricing model name"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="destinationEnvironment"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Destination Environment</FormLabel>
            <FormControl>
              <Select
                value={field.value}
                onValueChange={field.onChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Destination Environment" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(DestinationEnvironment).map(
                    (environment) => (
                      <SelectItem
                        key={environment}
                        value={environment}
                      >
                        {sentenceCase(environment)}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {showLivemodeWarning && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p className="font-medium">Cannot clone to Live mode</p>
            <p className="mt-1">
              Your organization already has a livemode pricing model.
              Each organization can have at most one livemode pricing
              model. Please select "Test mode" as the destination
              environment instead.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default ClonePricingModelFormFields
