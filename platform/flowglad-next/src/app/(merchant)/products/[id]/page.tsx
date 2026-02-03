import { Result } from 'better-result'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectPricesAndProductByProductId } from '@/db/tableMethods/priceMethods'
import { selectPricingModelById } from '@/db/tableMethods/pricingModelMethods'
import { selectFeaturesByProductFeatureWhere } from '@/db/tableMethods/productFeatureMethods'
import InternalProductDetailsPage from './InternalProductDetailsPage'

interface ProductPageProps {
  params: Promise<{
    id: string
  }>
}

const ProductPage = async ({ params }: ProductPageProps) => {
  const { id } = await params
  const { product, prices, pricingModel, features } = (
    await authenticatedTransaction(async ({ transaction }) => {
      const { prices, ...product } =
        await selectPricesAndProductByProductId(id, transaction)
      const pricingModel = (
        await selectPricingModelById(
          product.pricingModelId,
          transaction
        )
      ).unwrap()
      const productFeaturesWithDetails =
        await selectFeaturesByProductFeatureWhere(
          { productId: id },
          transaction
        )
      const features = productFeaturesWithDetails.map(
        ({ feature }) => feature
      )
      return Result.ok({ product, prices, pricingModel, features })
    })
  ).unwrap()
  return (
    <InternalProductDetailsPage
      product={product}
      prices={prices}
      pricingModel={pricingModel}
      features={features}
    />
  )
}
export default ProductPage
