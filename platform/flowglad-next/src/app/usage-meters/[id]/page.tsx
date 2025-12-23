import { notFound } from 'next/navigation'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import { selectUsageMeterById } from '@/db/tableMethods/usageMeterMethods'
import InnerUsageMeterDetailsPage from './InnerUsageMeterDetailsPage'

interface UsageMeterPageProps {
  params: Promise<{ id: string }>
}

const UsageMeterPage = async ({ params }: UsageMeterPageProps) => {
  const { id } = await params

  const { usageMeter, pricingModel } = await authenticatedTransaction(
    async ({ transaction }) => {
      let usageMeter
      try {
        usageMeter = await selectUsageMeterById(id, transaction)
      } catch (error) {
        // Only treat "not found" errors as expected; let other DB failures propagate
        if (
          error instanceof Error &&
          error.message.includes('No usage_meters found')
        ) {
          return {
            usageMeter: null,
            pricingModel: null,
          }
        }
        throw error
      }

      const [pricingModel] = await selectPricingModels(
        { id: usageMeter.pricingModelId },
        transaction
      )

      return {
        usageMeter,
        pricingModel: pricingModel ?? null,
      }
    }
  )

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
