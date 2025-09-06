import { trpc } from '@/app/_trpc/client'
import MultipleSelector from '@/components/forms/MultiSelect'
import { Controller, useFormContext } from 'react-hook-form'
import { CreateProductSchema } from '@/db/schema/prices'
import { Skeleton } from '@/components/ion/Skeleton'
import { useEffect } from 'react'
import { encodeCursor } from '@/db/tableUtils'

export const ProductFeatureMultiSelect = ({
  pricingModelId,
  productId,
}: {
  pricingModelId: string
  productId?: string
}) => {
  const { data: featuresData, isLoading: featuresLoading } =
    trpc.features.getFeaturesForPricingModel.useQuery(
      {
        pricingModelId,
      },
      {
        refetchOnMount: 'always',
        staleTime: 0,
      }
    )
  const {
    formState: { errors },
    control,
    setValue,
  } = useFormContext<CreateProductSchema>()

  // Fetch current product features for this product via paginated list with filter in cursor
  // Note: Using limit 100 (max allowed by pagination system). If a product has >100 features,
  // only the first 100 will be pre-selected. This seems unlikely in practice.
  const {
    data: productFeaturesData,
    isLoading: productFeaturesLoading,
  } = trpc.productFeatures.list.useQuery(
    {
      cursor: encodeCursor({
        parameters: {
          productId,
        },
        createdAt: new Date(0),
        direction: 'forward',
      }),
      limit: 100,
    },
    {
      enabled: !!productId,
      refetchOnMount: 'always',
      staleTime: 0,
    }
  )

  const productFeaturesHash = JSON.stringify(
    productFeaturesData ?? []
  )

  useEffect(() => {
    if (!productFeaturesHash) {
      return
    }
    const activeProductFeatures =
      productFeaturesData?.data.filter((pf) => !pf.expiredAt) ?? []

    setValue(
      'featureIds',
      activeProductFeatures.map((pf) => pf.featureId)
    )
  }, [productFeaturesHash])

  const loading = productFeaturesLoading || featuresLoading

  return (
    <>
      <label className="text-sm font-medium leading-none text-foreground">
        Features
      </label>
      {loading ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <Controller<CreateProductSchema, 'featureIds'>
          control={control}
          name="featureIds"
          render={({ field }) => (
            <MultipleSelector
              options={
                featuresData?.features.map((feature) => ({
                  label: feature.name,
                  value: feature.id,
                })) || []
              }
              value={(field.value || []).map((id) => {
                const feature = featuresData?.features.find(
                  (feat) => feat.id === id
                )
                return {
                  label: feature?.name ?? id,
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
