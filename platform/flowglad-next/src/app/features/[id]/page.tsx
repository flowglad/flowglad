import { Result } from 'better-result'
import { notFound } from 'next/navigation'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import type { Feature } from '@/db/schema/features'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { selectFeatureById } from '@/db/tableMethods/featureMethods'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import { selectUsageMeterById } from '@/db/tableMethods/usageMeterMethods'
import { FeatureType } from '@/types'
import InnerFeatureDetailsPage from './InnerFeatureDetailsPage'

interface FeaturePageProps {
  params: Promise<{ id: string }>
}

interface FeaturePageData {
  feature: Feature.Record | null
  pricingModel: PricingModel.Record | null
  usageMeter: UsageMeter.Record | null
}

const FeaturePage = async ({ params }: FeaturePageProps) => {
  const { id } = await params

  const txResult = await authenticatedTransaction<FeaturePageData>(
    async ({ transaction }) => {
      const featureResult = await selectFeatureById(id, transaction)
      if (Result.isError(featureResult)) {
        return Result.ok({
          feature: null,
          pricingModel: null,
          usageMeter: null,
        })
      }
      const feature = featureResult.unwrap()

      const [pricingModel] = await selectPricingModels(
        { id: feature.pricingModelId },
        transaction
      )

      // Get usage meter if feature is a UsageCreditGrant type
      let usageMeter: UsageMeter.Record | null = null
      if (
        feature.type === FeatureType.UsageCreditGrant &&
        feature.usageMeterId
      ) {
        usageMeter = (
          await selectUsageMeterById(
            feature.usageMeterId,
            transaction
          )
        ).unwrap()
      }

      return Result.ok({
        feature,
        pricingModel: pricingModel ?? null,
        usageMeter,
      })
    }
  )
  const { feature, pricingModel, usageMeter } = txResult.unwrap()

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
