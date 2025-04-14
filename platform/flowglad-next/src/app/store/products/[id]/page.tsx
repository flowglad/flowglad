import { authenticatedTransaction } from '@/db/databaseMethods'
import { selectPricesAndProductByProductId } from '@/db/tableMethods/priceMethods'
import InternalProductDetailsPage from './InternalProductDetailsPage'

interface ProductPageProps {
  params: Promise<{
    id: string
  }>
}

const ProductPage = async ({ params }: ProductPageProps) => {
  const { id } = await params
  const { product, prices } = await authenticatedTransaction(
    async ({ transaction }) => {
      const { prices, ...product } =
        await selectPricesAndProductByProductId(id, transaction)
      return { product, prices }
    }
  )
  return (
    <InternalProductDetailsPage product={product} prices={prices} />
  )
}
export default ProductPage
