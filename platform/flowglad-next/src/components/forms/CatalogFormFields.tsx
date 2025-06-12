'use client'

import { useFormContext, Controller } from 'react-hook-form'
import { CreateCatalogInput } from '@/db/schema/catalogs'
import Input from '@/components/ion/Input'
import Switch from '@/components/ion/Switch'

export default function CatalogFormFields() {
  const form = useFormContext<CreateCatalogInput>()
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Input
          id="name"
          {...form.register('catalog.name')}
          placeholder="Catalog name"
          label="Name"
        />
      </div>
      <Controller
        name="catalog.isDefault"
        control={form.control}
        render={({ field }) => (
          <Switch
            checked={field.value}
            onCheckedChange={field.onChange}
            label="Default catalog"
            description="This become the catalog that automatically attaches to new customers."
          />
        )}
      />
    </div>
  )
}
