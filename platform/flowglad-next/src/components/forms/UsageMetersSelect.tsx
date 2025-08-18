import { Control, Controller, useFormContext } from 'react-hook-form'
import Label from '@/components/ion/Label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useListUsageMetersQuery } from '@/app/hooks/useListUsageMetersQuery'
import { Skeleton } from '@/components/ion/Skeleton'
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
  const {
    watch,
    setValue,
    formState: { errors },
  } = form
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
      <Label>Usage Meter</Label>
      {isLoadingUsageMeters ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <div>
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
              {errors[name]?.message && (
                <p className="text-sm text-destructive mt-1">
                  {errors[name]?.message as string}
                </p>
              )}
            </div>
          )}
        />
      )}
    </>
  )
}

export default UsageMetersSelect
