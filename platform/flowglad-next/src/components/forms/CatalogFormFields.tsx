'use client'

import { useFormContext } from 'react-hook-form'
import { CreateCatalogInput } from '@/db/schema/catalogs'
import Input from '@/components/ion/Input'
import Label from '@/components/ion/Label'

export default function CatalogFormFields() {
  const form = useFormContext<CreateCatalogInput>()
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          id="name"
          {...form.register('catalog.name')}
          placeholder="Catalog name"
          label="Name"
        />
      </div>
    </div>
  )
}
