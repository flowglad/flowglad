import { notFound } from 'next/navigation'
import { authenticatedTransactionUnwrap } from '@/db/authenticatedTransaction'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import InnerPricingModelDetailsPage from './InnerPricingModelDetailsPage'

interface PricingModelPageProps {
  params: Promise<{ id: string }>
}

const PricingModelPage = async ({
  params,
}: PricingModelPageProps) => {
  const { id } = await params
  const pricingModel = await authenticatedTransactionUnwrap(
    async ({ transaction }) => {
      const [pricingModel] = await selectPricingModels(
        { id },
        transaction
      )
      return pricingModel
    }
  )

  if (!pricingModel) {
    notFound()
  }

  return <InnerPricingModelDetailsPage pricingModel={pricingModel} />
}

export default PricingModelPage
