import * as R from 'ramda'
import Internal from './Internal'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { Price } from '@/db/schema/prices'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { selectPricesAndProductsForOrganization } from '@/db/tableMethods/priceMethods'

const ProductsPage = async () => {
  const { productsAndPrices: productsResult } =
    await authenticatedTransaction(
      async ({ transaction, userId }) => {
        const [membership] = await selectMembershipAndOrganizations(
          {
            userId,
            focused: true,
          },
          transaction
        )
        const productsResult =
          await selectPricesAndProductsForOrganization(
            {},
            membership.organization.id,
            transaction
          )
        return {
          productsAndPrices: productsResult,
        }
      }
    )
  const pricesByProductId = new Map<string, Price.ClientRecord[]>()
  productsResult.forEach((p) => {
    pricesByProductId.set(p.product.id, [
      ...(pricesByProductId.get(p.product.id) ?? []),
      p.price,
    ])
  })
  const uniqueProducts = R.uniqBy(
    (p) => p.id,
    productsResult.map((p) => p.product)
  )

  const products = uniqueProducts.map((product) => ({
    product,
    prices: pricesByProductId.get(product.id) ?? [],
  }))

  products.sort(
    (a, b) =>
      b.product.createdAt.getTime() - a.product.createdAt.getTime()
  )

  return <Internal products={products} />
}

export default ProductsPage
