'use client'

import { useFormContext, Controller } from 'react-hook-form'
import {
  CreateFeatureInput,
  toggleFeatureDefaultColumns,
  usageCreditGrantFeatureDefaultColumns,
} from '@/db/schema/features'
import Input from '@/components/ion/Input'
import NumberInput from '@/components/ion/NumberInput'
import Select from '@/components/ion/Select'
import { FeatureType, FeatureUsageGrantFrequency } from '@/types'
import UsageMetersSelect from './UsageMetersSelect'
import Textarea from '@/components/ion/Textarea'
import core, { titleCase } from '@/utils/core'
import Switch from '@/components/ion/Switch'

const FeatureFormFields = () => {
  const {
    register,
    formState: { errors },
    control,
    watch,
    setValue,
  } = useFormContext<CreateFeatureInput>()

  const featureType = watch('feature.type')
  if (!core.IS_PROD) {
    // eslint-disable-next-line no-console
    console.log('errors', errors)
  }
  const assignFeatureValueFromTuple = (tuple: [string, any]) => {
    const [key, value] = tuple
    // @ts-expect-error - key is a valid key of usagePriceDefaultColumns
    setValue(`feature.${key}`, value)
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        {...register('feature.name')}
        label="Name"
        placeholder="e.g. My Awesome Feature"
        error={errors.feature?.name?.message}
      />
      <Input
        {...register('feature.slug')}
        label="Slug"
        placeholder="e.g. my-awesome-feature"
        hint="Used to check access on the SDK. Must be unique within each catalog."
        error={errors.feature?.slug?.message}
      />
      <Input
        {...register('feature.description')}
        label="Description"
        placeholder="Describe the feature"
        error={errors.feature?.description?.message}
      />
      <Controller
        control={control}
        name="feature.type"
        render={({ field }) => (
          <Select
            label="Type"
            value={field.value}
            onValueChange={(value) => {
              field.onChange(value)
              // Reset fields when type changes
              if (value === FeatureType.Toggle) {
                Object.entries(toggleFeatureDefaultColumns).forEach(
                  assignFeatureValueFromTuple
                )
              }
              if (value === FeatureType.UsageCreditGrant) {
                Object.entries(
                  usageCreditGrantFeatureDefaultColumns
                ).forEach(assignFeatureValueFromTuple)
              }
            }}
            options={[
              {
                label: 'Toggle',
                value: FeatureType.Toggle,
                description: 'Boolean access to a feature.',
              },
              {
                label: 'Usage Credit Grant',
                value: FeatureType.UsageCreditGrant,
                description:
                  'Credits towards a specific usage meter.',
              },
            ]}
          />
        )}
      />

      {featureType === FeatureType.UsageCreditGrant && (
        <>
          <Controller
            control={control}
            name="feature.amount"
            render={({ field }) => (
              <NumberInput
                {...field}
                label="Amount"
                placeholder="e.g. 100"
                value={field.value ?? undefined} // Ensure undefined for empty to avoid "0" display issues
                onChange={(e) =>
                  field.onChange(parseInt(e.target.value, 10) || null)
                }
                error={errors.feature?.amount?.message}
              />
            )}
          />
          <UsageMetersSelect
            name="feature.usageMeterId"
            control={control}
          />
          <Controller
            control={control}
            name="feature.renewalFrequency"
            render={({ field }) => (
              <Select
                label="Renewal Frequency"
                placeholder="Select renewal frequency"
                options={Object.values(
                  FeatureUsageGrantFrequency
                ).map((value) => ({
                  label: titleCase(value),
                  value,
                }))}
                value={field.value ?? ''}
                onValueChange={field.onChange}
                error={errors.feature?.renewalFrequency?.message}
              />
            )}
          />
        </>
      )}
      <Controller
        control={control}
        name="feature.active"
        render={({ field }) => (
          <Switch
            label="Active"
            checked={field.value}
            onCheckedChange={field.onChange}
          />
        )}
      />
    </div>
  )
}

export default FeatureFormFields
