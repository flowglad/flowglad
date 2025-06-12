'use client'

import {
  useFormContext,
  Controller,
  FieldError,
} from 'react-hook-form'
import { CreateFeatureInput } from '@/db/schema/features'
import { RadioGroup, RadioGroupItem } from '@/components/ion/Radio'
import Input from '@/components/ion/Input'
import NumberInput from '@/components/ion/NumberInput'
import Select from '@/components/ion/Select'
import { FeatureType, FeatureUsageGrantFrequency } from '@/types'
import UsageMetersSelect from './UsageMetersSelect'
import Textarea from '@/components/ion/Textarea'
import { titleCase } from '@/utils/core'
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
        error={errors.feature?.slug?.message}
      />
      <Controller
        control={control}
        name="feature.description"
        render={({ field }) => (
          <Textarea
            {...field}
            label="Description"
            placeholder="Describe the feature"
            error={errors.feature?.description?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="feature.type"
        render={({ field }) => (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-foreground">Type</p>
            <RadioGroup
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value)
                // Reset fields when type changes
                if (value === FeatureType.Toggle) {
                  setValue('feature.amount', null)
                  setValue('feature.usageMeterId', null)
                  setValue('feature.renewalFrequency', null)
                }
              }}
              className="flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value={FeatureType.Toggle}
                  label="Toggle"
                  id={FeatureType.Toggle}
                />
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value={FeatureType.UsageCreditGrant}
                  label="Usage Credit Grant"
                  id={FeatureType.UsageCreditGrant}
                />
              </div>
            </RadioGroup>
          </div>
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
