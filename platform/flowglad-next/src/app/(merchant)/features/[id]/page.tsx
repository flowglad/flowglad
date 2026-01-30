import { FeatureType } from '@db-core/enums'
import type { Feature } from '@db-core/schema/features'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { UsageMeter } from '@db-core/schema/usageMeters'
import { NotFoundError } from '@db-core/tableUtils'
import { Result } from 'better-result'
import { notFound } from 'next/navigation'
import { authenticatedTransactionWithResult } from '@/db/authenticatedTransaction'
import { selectFeatureById } from '@/db/tableMethods/featureMethods'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import { selectUsageMeterById } from '@/db/tableMethods/usageMeterMethods'
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

  const { feature, pricingModel, usageMeter } = (
    await authenticatedTransactionWithResult(
      async ({
        transaction,
      }): Promise<Result<FeaturePageData, Error>> => {
        const featureResult = await selectFeatureById(id, transaction)
        if (Result.isError(featureResult)) {
          // Only treat NotFoundError as a 404 case; propagate other errors
          if (featureResult.error instanceof NotFoundError) {
            return Result.ok({
              feature: null,
              pricingModel: null,
              usageMeter: null,
            })
          }
          return Result.err(featureResult.error)
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
  ).unwrap()

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
