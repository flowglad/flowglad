import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectPricesAndProductByProductId } from '@/db/tableMethods/priceMethods'
import { selectPricingModelById } from '@/db/tableMethods/pricingModelMethods'
import InternalProductDetailsPage from './InternalProductDetailsPage'

interface ProductPageProps {
  params: Promise<{
    id: string
  }>
}

const ProductPage = async ({ params }: ProductPageProps) => {
  const { id } = await params
  const { product, prices, pricingModel } =
    await authenticatedTransaction(async ({ transaction }) => {
      const { prices, ...product } =
        await selectPricesAndProductByProductId(id, transaction)
      const pricingModel = await selectPricingModelById(
        product.pricingModelId,
        transaction
      )
      return { product, prices, pricingModel }
    })
  return (
    <InternalProductDetailsPage
      product={product}
      prices={prices}
      pricingModel={pricingModel}
    />
  )
}
export default ProductPage
