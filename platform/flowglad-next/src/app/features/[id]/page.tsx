import { notFound } from 'next/navigation'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectFeatureById } from '@/db/tableMethods/featureMethods'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import { selectUsageMeterById } from '@/db/tableMethods/usageMeterMethods'
import { FeatureType } from '@/types'
import InnerFeatureDetailsPage from './InnerFeatureDetailsPage'

interface FeaturePageProps {
  params: Promise<{ id: string }>
}

const FeaturePage = async ({ params }: FeaturePageProps) => {
  const { id } = await params

  const { feature, pricingModel, usageMeter } =
    await authenticatedTransaction(async ({ transaction }) => {
      let feature
      try {
        feature = await selectFeatureById(id, transaction)
      } catch (error) {
        // Only treat "not found" errors as expected; let other DB failures propagate
        if (
          error instanceof Error &&
          error.message.includes('No features found')
        ) {
          return {
            feature: null,
            pricingModel: null,
            usageMeter: null,
          }
        }
        throw error
      }

      const [pricingModel] = await selectPricingModels(
        { id: feature.pricingModelId },
        transaction
      )

      // Get usage meter if feature is a UsageCreditGrant type
      let usageMeter = null
      if (
        feature.type === FeatureType.UsageCreditGrant &&
        feature.usageMeterId
      ) {
        usageMeter = await selectUsageMeterById(
          feature.usageMeterId,
          transaction
        )
      }

      return {
        feature,
        pricingModel: pricingModel ?? null,
        usageMeter,
      }
    })

  if (!feature) {
    notFound()
  }

  return (
    <InnerFeatureDetailsPage
      feature={feature}
      pricingModel={pricingModel}
      usageMeter={usageMeter}
    />
  )
}

export default FeaturePage
