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
}

const UsageMetersSelect = ({
  name,
  control,
}: UsageMetersSelectProps) => {
  const { data: usageMeters, isLoading: isLoadingUsageMeters } =
    useListUsageMetersQuery()
  const form = useFormContext()
  const { watch, setValue } = form
  const usageMeterId = watch(name)

  // Auto-select first usage meter if none is selected when data loads
  useEffect(() => {
    if (!usageMeters?.data?.length) {
      return
    }
    if (usageMeterId) {
      return
    }
    setValue(name, usageMeters.data[0].id)
  }, [name, usageMeterId, usageMeters?.data, setValue])

  return (
    <>
      {isLoadingUsageMeters ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <FormField
          control={control}
          name={name}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Usage Meter</FormLabel>
              <FormControl>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
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
