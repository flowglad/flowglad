import React from 'react'
import { useFormContext } from 'react-hook-form'
import Input from '@/components/ion/Input'
import { CloneCatalogInput } from '@/db/schema/catalogs'

const CloneCatalogFormFields: React.FC = () => {
  const {
    register,
    formState: { errors },
  } = useFormContext<CloneCatalogInput>()
  return (
    <div className="flex flex-col gap-3">
      <Input
        label="Catalog Name"
        required
        {...register('name')}
        error={errors.name?.message}
      />
    </div>
  )
}

export default CloneCatalogFormFields
