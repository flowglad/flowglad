import { useEffect } from 'react'
import { type Control, useFormContext } from 'react-hook-form'
import { trpc } from '@/app/_trpc/client'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

interface ResourcesSelectProps {
  name: string
  control: Control<any>
  disabled?: boolean
}

const ResourcesSelect = ({
  name,
  control,
  disabled,
}: ResourcesSelectProps) => {
  const { data, isLoading: isLoadingResources } =
    trpc.resources.list.useQuery(
      {},
      {
        refetchOnMount: 'always',
        staleTime: 0,
      }
    )
  const resources = data?.resources
  const form = useFormContext()
  const { watch, setValue } = form
  const resourceId = watch(name)

  // Validate and reset selection when filtered data changes
  useEffect(() => {
    // If no resources available, clear the selection
    if (!resources?.length) {
      if (resourceId) {
        setValue(name, '')
      }
      return
    }

    // Check if current selection exists in the filtered list
    const isCurrentResourceValid = resources.some(
      (resource) => resource.id === resourceId
    )

    if (!isCurrentResourceValid) {
      // Reset to first resource when current selection is invalid
      setValue(name, resources[0].id)
    }
  }, [name, resourceId, resources, setValue])

  const hasNoResources =
    !isLoadingResources && (!resources || resources.length === 0)

  return (
    <>
      {isLoadingResources ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <FormField
          control={control}
          name={name}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Resource</FormLabel>
              <FormControl>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={disabled || hasNoResources}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        hasNoResources
                          ? 'No resources available'
                          : 'Select a resource'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {resources?.map((item) => (
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

export default ResourcesSelect
