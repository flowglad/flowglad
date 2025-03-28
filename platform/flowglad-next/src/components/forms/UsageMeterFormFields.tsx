'use client'

import { useFormContext } from 'react-hook-form'
import { CreateUsageMeterInput } from '@/db/schema/usageMeters'
import Input from '@/components/ion/Input'
import CatalogSelect from './CatalogSelect'

export default function UsageMeterFormFields() {
  const form = useFormContext<CreateUsageMeterInput>()
  return (
    <div className="space-y-4">
      <Input label="Name" {...form.register('usageMeter.name')} />
      <div className="w-full relative flex flex-col gap-3">
        <CatalogSelect
          name="product.catalogId"
          control={form.control}
        />
      </div>
    </div>
  )
}
