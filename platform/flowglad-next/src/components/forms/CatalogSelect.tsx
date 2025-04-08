import { Control, Controller, useFormContext } from 'react-hook-form'
import Label from '../ion/Label'
import Select from '../ion/Select'
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
      <Label>Catalog</Label>
      {isLoadingCatalogs ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <Select
              options={
                catalogs?.data?.map((catalog) => ({
                  label: catalog.name,
                  value: catalog.id,
                })) || []
              }
              value={field.value}
              onValueChange={field.onChange}
            />
          )}
        />
      )}
    </>
  )
}

export default CatalogSelect
