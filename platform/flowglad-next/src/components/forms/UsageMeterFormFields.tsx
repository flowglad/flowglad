'use client'

import { Controller, useFormContext } from 'react-hook-form'
import { CreateUsageMeterInput } from '@/db/schema/usageMeters'
import Input from '@/components/ion/Input'
import CatalogSelect from './CatalogSelect'
import Select from '../ion/Select'
import { UsageMeterAggregationType } from '@/types'
import { sentenceCase } from 'change-case'

export default function UsageMeterFormFields({
  edit,
}: {
  edit?: boolean
}) {
  const form = useFormContext<CreateUsageMeterInput>()
  return (
    <div className="space-y-4">
      <Input label="Name" {...form.register('usageMeter.name')} />
      <div className="w-full relative flex flex-col gap-3">
        <CatalogSelect
          name="usageMeter.catalogId"
          control={form.control}
        />
      </div>
      <Controller
        control={form.control}
        name="usageMeter.aggregationType"
        render={({ field }) => (
          <Select
            {...field}
            options={Object.values(UsageMeterAggregationType).map(
              (type) => ({
                label: sentenceCase(type),
                value: type,
              })
            )}
            label="Aggregation Type"
          />
        )}
      />
    </div>
  )
}
