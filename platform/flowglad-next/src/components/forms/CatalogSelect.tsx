import { Control, Controller, useFormContext } from 'react-hook-form'
import Label from '../ion/Label'
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
import { Skeleton } from '../ion/Skeleton'

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
  const {
    watch,
    setValue,
    formState: { errors },
  } = form
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
      <Label>Catalog</Label>
      {isLoadingCatalogs ? (
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
                  {catalogs?.data?.map((catalog) => (
                    <SelectItem key={catalog.id} value={catalog.id}>
                      {catalog.name}
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

export default CatalogSelect
