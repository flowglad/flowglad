import { sentenceCase } from 'change-case'
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

const ClonePricingModelFormFields: React.FC = () => {
  const form = useFormContext<ClonePricingModelInput>()

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
    </div>
  )
}

export default ClonePricingModelFormFields
