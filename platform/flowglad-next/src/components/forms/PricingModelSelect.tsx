import { useEffect } from 'react'
import { type Control, useFormContext } from 'react-hook-form'
import { trpc } from '@/app/_trpc/client'
import { useListPricingModelsQuery } from '@/app/hooks/useListPricingModelsQuery'
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
import { Skeleton } from '../ui/skeleton'

interface PricingModelSelectProps {
  name: string
  control: Control<any>
}

const PricingModelSelect = ({
  name,
  control,
}: PricingModelSelectProps) => {
  const { data: pricingModels, isLoading: isLoadingPricingModels } =
    useListPricingModelsQuery()
  const { data: defaultPricingModel } =
    trpc.pricingModels.getDefault.useQuery({})
  const defaultPricingModelId = defaultPricingModel?.pricingModel.id
  const form = useFormContext()
  const { watch, setValue } = form
  const pricingModelId = watch(name)
  // once the default pricingModel loads, set it if the pricingModel id has not been set
  useEffect(() => {
    if (!defaultPricingModelId) {
      return
    }
    if (pricingModelId) {
      return
    }
    setValue(name, defaultPricingModelId)
  }, [name, pricingModelId, defaultPricingModelId, setValue])
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Pricing model</FormLabel>
          <FormControl>
            {isLoadingPricingModels ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select
                value={field.value}
                onValueChange={field.onChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pricingModels?.data?.map((pricingModel) => (
                    <SelectItem
                      key={pricingModel.id}
                      value={pricingModel.id}
                    >
                      {pricingModel.name}
                    </SelectItem>
                  )) || []}
                </SelectContent>
              </Select>
            )}
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export default PricingModelSelect
