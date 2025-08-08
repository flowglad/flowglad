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
import { useListCatalogsQuery } from '@/app/hooks/useListCatalogsQuery'
import { useEffect } from 'react'
import { trpc } from '@/app/_trpc/client'
import { Skeleton } from '../ui/skeleton'

interface CatalogSelectProps {
  name: string
  control: Control<any>
}

const CatalogSelect = ({ name, control }: CatalogSelectProps) => {
  const { data: catalogs, isLoading: isLoadingCatalogs } =
    useListCatalogsQuery()
  const { data: defaultCatalog } = trpc.catalogs.getDefault.useQuery(
    {}
  )
  const defaultCatalogId = defaultCatalog?.catalog.id
  const form = useFormContext()
  const { watch, setValue } = form
  const catalogId = watch(name)
  // once the default catalog loads, set it if the catalog id has not been set
  useEffect(() => {
    if (!defaultCatalogId) {
      return
    }
    if (catalogId) {
      return
    }
    setValue(name, defaultCatalogId)
  }, [name, catalogId, defaultCatalogId, setValue])
  return (
    <>
      {isLoadingCatalogs ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <FormField
          control={control}
          name={name}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Catalog</FormLabel>
              <FormControl>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {catalogs?.data?.map((catalog) => (
                      <SelectItem key={catalog.id} value={catalog.id}>
                        {catalog.name}
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

export default CatalogSelect
