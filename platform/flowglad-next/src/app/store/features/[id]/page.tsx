import { notFound } from 'next/navigation'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectFeatureById } from '@/db/tableMethods/featureMethods'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import { selectUsageMeterById } from '@/db/tableMethods/usageMeterMethods'
import InnerFeatureDetailsPage from './InnerFeatureDetailsPage'
import { FeatureType } from '@/types'
import { parseNavigationContext } from '@/lib/navigation-context'

interface FeaturePageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const FeaturePage = async ({ params, searchParams }: FeaturePageProps) => {
  const { id } = await params
  const resolvedSearchParams = await searchParams

  // Parse navigation context from URL for smart breadcrumbs
  const navigationContext = parseNavigationContext(resolvedSearchParams)

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
          return { feature: null, pricingModel: null, usageMeter: null }
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

        return { feature, pricingModel: pricingModel ?? null, usageMeter }
    })

  if (!feature) {
    notFound()
  }

  return (
    <InnerFeatureDetailsPage
      feature={feature}
      pricingModel={pricingModel}
      usageMeter={usageMeter}
      navigationContext={navigationContext}
    />
  )
}

export default FeaturePage

