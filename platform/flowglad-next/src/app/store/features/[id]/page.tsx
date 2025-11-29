import { notFound } from 'next/navigation'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectFeatureById } from '@/db/tableMethods/featureMethods'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import { selectUsageMeterById } from '@/db/tableMethods/usageMeterMethods'
import InnerFeatureDetailsPage from './InnerFeatureDetailsPage'
import { FeatureType } from '@/types'

interface FeaturePageProps {
  params: Promise<{ id: string }>
}

const FeaturePage = async ({ params }: FeaturePageProps) => {
  const { id } = await params

  const { feature, pricingModel, usageMeter } =
    await authenticatedTransaction(async ({ transaction }) => {
      try {
        const feature = await selectFeatureById(id, transaction)

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

        return { feature, pricingModel: pricingModel ?? null, usageMeter }
      } catch {
        // selectFeatureById throws if feature not found
        return { feature: null, pricingModel: null, usageMeter: null }
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

