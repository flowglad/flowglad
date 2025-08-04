import { Control, Controller, useFormContext } from 'react-hook-form'
import Label from '@/components/ion/Label'
import Select from '@/components/ion/Select'
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
            <Select
              options={
                usageMeters?.data?.map((item) => ({
                  label: item.name,
                  value: item.id,
                })) || []
              }
              value={field.value}
              onValueChange={field.onChange}
              error={errors[name]?.message as string | undefined}
            />
          )}
        />
      )}
    </>
  )
}

export default UsageMetersSelect
