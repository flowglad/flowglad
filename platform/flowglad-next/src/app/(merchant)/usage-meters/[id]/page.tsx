import type { PricingModel } from '@db-core/schema/pricingModels'
import type { UsageMeter } from '@db-core/schema/usageMeters'
import { Result } from 'better-result'
import { notFound } from 'next/navigation'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import { selectUsageMeters } from '@/db/tableMethods/usageMeterMethods'
import InnerUsageMeterDetailsPage from './InnerUsageMeterDetailsPage'

interface UsageMeterPageProps {
  params: Promise<{ id: string }>
}

interface UsageMeterPageData {
  usageMeter: UsageMeter.Record | null
  pricingModel: PricingModel.Record | null
}

const UsageMeterPage = async ({ params }: UsageMeterPageProps) => {
  const { id } = await params

  const { usageMeter, pricingModel } = (
    await authenticatedTransaction(
      async ({
        transaction,
      }): Promise<Result<UsageMeterPageData, Error>> => {
        const [usageMeter] = await selectUsageMeters(
          { id },
          transaction
        )

        if (!usageMeter) {
          return Result.ok({ usageMeter: null, pricingModel: null })
        }

        const [pricingModel] = await selectPricingModels(
          { id: usageMeter.pricingModelId },
          transaction
        )

        return Result.ok({
          usageMeter,
          pricingModel: pricingModel ?? null,
        })
      }
    )
  ).unwrap()

  if (!usageMeter) {
    notFound()
  }

  return (
    <InnerUsageMeterDetailsPage
      usageMeter={usageMeter}
      pricingModel={pricingModel}
    />
  )
}

export default UsageMeterPage
