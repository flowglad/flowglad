import { Control, Controller, useFormContext } from 'react-hook-form'
import Label from '../ion/Label'
import Select from '../ion/Select'
import { useListCatalogsQuery } from '@/app/hooks/useListCatalogsQuery'

interface CatalogSelectProps {
  name: string
  control: Control<any>
}

const CatalogSelect = ({ name, control }: CatalogSelectProps) => {
  const { data: catalogs } = useListCatalogsQuery()
  return (
    <>
      <Label>Catalog</Label>
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
    </>
  )
}

export default CatalogSelect
