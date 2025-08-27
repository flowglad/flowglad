import React from 'react'
import { useFormContext } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { CloneCatalogInput } from '@/db/schema/pricingModels'

const CloneCatalogFormFields: React.FC = () => {
  const form = useFormContext<CloneCatalogInput>()

  return (
    <div className="flex flex-col gap-3">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel required>Catalog Name</FormLabel>
            <FormControl>
              <Input placeholder="Enter catalog name" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

export default CloneCatalogFormFields
