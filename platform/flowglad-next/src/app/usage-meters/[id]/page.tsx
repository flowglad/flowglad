import { notFound } from 'next/navigation'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import { selectUsageMeters } from '@/db/tableMethods/usageMeterMethods'
import InnerUsageMeterDetailsPage from './InnerUsageMeterDetailsPage'

interface UsageMeterPageProps {
  params: Promise<{ id: string }>
}

const UsageMeterPage = async ({ params }: UsageMeterPageProps) => {
  const { id } = await params

  const { usageMeter, pricingModel } = (
    await authenticatedTransaction(async ({ transaction }) => {
      const [usageMeter] = await selectUsageMeters(
        { id },
        transaction
      )

      if (!usageMeter) {
        return { usageMeter: null, pricingModel: null }
      }

      const [pricingModel] = await selectPricingModels(
        { id: usageMeter.pricingModelId },
        transaction
      )

      return {
        usageMeter,
        pricingModel: pricingModel ?? null,
      }
    })
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
