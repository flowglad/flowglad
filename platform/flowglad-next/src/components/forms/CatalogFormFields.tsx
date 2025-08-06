'use client'

import { useFormContext, Controller } from 'react-hook-form'
import { CreateCatalogInput } from '@/db/schema/catalogs'
import { Input } from '@/components/ui/input'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'

export default function CatalogFormFields() {
  const form = useFormContext<CreateCatalogInput>()
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <FormField
          control={form.control}
          name="catalog.name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  id="name"
                  placeholder="Catalog name"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
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
