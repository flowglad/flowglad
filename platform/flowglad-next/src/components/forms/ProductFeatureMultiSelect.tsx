import { trpc } from '@/app/_trpc/client'
import MultipleSelector from '@/components/forms/MultiSelect'
import { Controller, useFormContext } from 'react-hook-form'
import { CreateProductSchema } from '@/db/schema/prices'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ion/Skeleton'

export const ProductFeatureMultiSelect = ({
  pricingModelId,
}: {
  pricingModelId: string
}) => {
  const { data: features } =
    trpc.features.getFeaturesForPricingModel.useQuery({
      pricingModelId,
    })
  const {
    formState: { errors },
    control,
  } = useFormContext<CreateProductSchema>()

  return (
    <>
      <Label>Features</Label>
      {!features ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <Controller<CreateProductSchema, 'featureIds'>
          control={control}
          name="featureIds"
          render={({ field }) => (
            <MultipleSelector
              options={
                features?.features.map((feature) => ({
                  label: feature.name,
                  value: feature.id,
                })) || []
              }
              value={(field.value || []).map((id) => {
                const f = features?.features.find(
                  (feat) => feat.id === id
                )
                return {
                  label: f?.name ?? id,
                  value: id,
                }
              })}
              onChange={(selected) => {
                field.onChange(selected.map((opt) => opt.value))
              }}
              placeholder="Select features"
              error={errors.featureIds?.message as string | undefined}
            />
          )}
        />
      )}
    </>
  )
}

export default ProductFeatureMultiSelect
