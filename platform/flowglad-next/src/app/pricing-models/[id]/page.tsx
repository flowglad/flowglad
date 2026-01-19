import { notFound } from 'next/navigation'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import InnerPricingModelDetailsPage from './InnerPricingModelDetailsPage'

interface PricingModelPageProps {
  params: Promise<{ id: string }>
}

const PricingModelPage = async ({
  params,
}: PricingModelPageProps) => {
  const { id } = await params
  const pricingModel = (
    await authenticatedTransaction(async ({ transaction }) => {
      const [pricingModel] = await selectPricingModels(
        { id },
        transaction
      )
      return pricingModel
    })
  ).unwrap()

  if (!pricingModel) {
    notFound()
  }

  return <InnerPricingModelDetailsPage pricingModel={pricingModel} />
}

export default PricingModelPage
