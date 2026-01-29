import { FeatureType } from '@db-core/enums'
import { Result } from 'better-result'
import { notFound } from 'next/navigation'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectFeatureById } from '@/db/tableMethods/featureMethods'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import { selectUsageMeterById } from '@/db/tableMethods/usageMeterMethods'
import InnerFeatureDetailsPage from './InnerFeatureDetailsPage'

interface FeaturePageProps {
  params: Promise<{ id: string }>
}

const FeaturePage = async ({ params }: FeaturePageProps) => {
  const { id } = await params

  const { feature, pricingModel, usageMeter } =
    await authenticatedTransaction(async ({ transaction }) => {
      const featureResult = await selectFeatureById(id, transaction)
      if (Result.isError(featureResult)) {
        return {
          feature: null,
          pricingModel: null,
          usageMeter: null,
        }
      }
      const feature = featureResult.unwrap()

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
        usageMeter = (
          await selectUsageMeterById(
            feature.usageMeterId,
            transaction
          )
        ).unwrap()
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
