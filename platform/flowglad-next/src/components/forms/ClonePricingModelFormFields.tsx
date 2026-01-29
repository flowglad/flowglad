import { DestinationEnvironment } from '@db-core/enums'
import { sentenceCase } from 'change-case'
import { AlertTriangle } from 'lucide-react'
import type React from 'react'
import { useEffect } from 'react'
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

interface ClonePricingModelFormFieldsProps {
  hasLivemodePricingModel?: boolean
  onWarningChange?: (showWarning: boolean) => void
  livemode: boolean
}

const ClonePricingModelFormFields: React.FC<
  ClonePricingModelFormFieldsProps
> = ({
  hasLivemodePricingModel = false,
  onWarningChange,
  livemode,
}) => {
  const form = useFormContext<ClonePricingModelInput>()
  const selectedDestination = form.watch('destinationEnvironment')

  // In testmode, user can only clone to testmode
  const isTestmode = !livemode

  // Auto-set destination to testmode when in testmode
  useEffect(() => {
    if (
      isTestmode &&
      selectedDestination !== DestinationEnvironment.Testmode
    ) {
      form.setValue(
        'destinationEnvironment',
        DestinationEnvironment.Testmode
      )
    }
  }, [isTestmode, selectedDestination, form])

  // Show warning if user is about to clone to livemode but already has one
  // (only relevant in livemode since testmode can't select livemode)
  const showLivemodeWarning =
    !isTestmode &&
    hasLivemodePricingModel &&
    selectedDestination === DestinationEnvironment.Livemode

  // Notify parent when warning state changes
  useEffect(() => {
    onWarningChange?.(showLivemodeWarning)
  }, [showLivemodeWarning, onWarningChange])

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
      {isTestmode ? (
        // In testmode, show disabled select locked to testmode
        <FormItem>
          <FormLabel>Destination Environment</FormLabel>
          <Select value={DestinationEnvironment.Testmode} disabled>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DestinationEnvironment.Testmode}>
                {sentenceCase(DestinationEnvironment.Testmode)}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Testmode pricing models can only be cloned to testmode.
          </p>
        </FormItem>
      ) : (
        // In livemode, show full select with both options
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
      )}

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
