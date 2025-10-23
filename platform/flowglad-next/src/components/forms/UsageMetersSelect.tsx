import { Control, useFormContext } from 'react-hook-form'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useListUsageMetersQuery } from '@/app/hooks/useListUsageMetersQuery'
import { Skeleton } from '@/components/ui/skeleton'
import { useEffect } from 'react'

interface UsageMetersSelectProps {
  name: string
  control: Control<any>
  disabled?: boolean
  pricingModelId?: string
}

const UsageMetersSelect = ({
  name,
  control,
  disabled,
  pricingModelId,
}: UsageMetersSelectProps) => {
  const { data: usageMeters, isLoading: isLoadingUsageMeters } =
    useListUsageMetersQuery(pricingModelId)
  const form = useFormContext()
  const { watch, setValue } = form
  const usageMeterId = watch(name)

  // Validate and reset selection when filtered data changes
  useEffect(() => {
    // If no usage meters available, clear the selection
    if (!usageMeters?.data?.length) {
      if (usageMeterId) {
        setValue(name, '')
      }
      return
    }

    // Check if current selection exists in the filtered list
    const isCurrentMeterValid = usageMeters.data.some(
      (meter) => meter.id === usageMeterId
    )

    if (!isCurrentMeterValid) {
      // Reset to first meter when current selection is invalid
      setValue(name, usageMeters.data[0].id)
    }
  }, [name, usageMeterId, usageMeters?.data, setValue])

  return (
    <>
      {isLoadingUsageMeters ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <FormField
          control={control}
          name={name}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Usage Meter</FormLabel>
              <FormControl>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {usageMeters?.data?.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    )) || []}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </>
  )
}

export default UsageMetersSelect
