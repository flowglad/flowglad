import * as R from 'ramda'
import Internal from './Internal'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { Price } from '@/db/schema/prices'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import {
  selectPricesAndProductsForOrganization,
  selectPricesProductsAndCatalogsForOrganization,
} from '@/db/tableMethods/priceMethods'
import { Catalog } from '@/db/schema/catalogs'

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
          await selectPricesProductsAndCatalogsForOrganization(
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

  const catalogsByProductId = new Map<string, Catalog.ClientRecord>()
  productsResult.forEach((p) => {
    if (p.catalog) {
      catalogsByProductId.set(p.product.id, p.catalog)
    }
  })

  const products = uniqueProducts.map((product) => ({
    ...product,
    prices: pricesByProductId.get(product.id) ?? [],
    defaultPrice:
      pricesByProductId
        .get(product.id)
        ?.find((price) => price.isDefault) ??
      pricesByProductId.get(product.id)?.[0]!,
    catalog: catalogsByProductId.get(product.id)!,
  }))

  products.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )
  return <Internal products={products} />
}

export default ProductsPage
