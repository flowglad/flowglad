import * as R from 'ramda'
import Internal from './Internal'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { Variant } from '@/db/schema/variants'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { selectVariantsAndProductsForOrganization } from '@/db/tableMethods/variantMethods'

const ProductsPage = async () => {
  const { productsAndVariants: productsResult } =
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
          await selectVariantsAndProductsForOrganization(
            {},
            membership.organization.id,
            transaction
          )
        return {
          productsAndVariants: productsResult,
        }
      }
    )
  const variantsByProductId = new Map<
    string,
    Variant.ClientRecord[]
  >()
  productsResult.forEach((p) => {
    variantsByProductId.set(p.product.id, [
      ...(variantsByProductId.get(p.product.id) ?? []),
      p.variant,
    ])
  })
  const uniqueProducts = R.uniqBy(
    (p) => p.id,
    productsResult.map((p) => p.product)
  )

  const products = uniqueProducts.map((product) => ({
    product,
    variants: variantsByProductId.get(product.id) ?? [],
  }))

  products.sort(
    (a, b) =>
      b.product.createdAt.getTime() - a.product.createdAt.getTime()
  )

  return <Internal products={products} />
}

export default ProductsPage
