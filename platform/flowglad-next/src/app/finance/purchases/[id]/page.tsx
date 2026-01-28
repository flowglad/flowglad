import { notFound } from 'next/navigation'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { Price } from '@/db/schema/prices'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectProductById } from '@/db/tableMethods/productMethods'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import InnerPurchasePage from './InnerPurchasePage'

const PurchasePage = async ({
  params,
}: {
  params: Promise<{ id: string }>
}) => {
  const { id } = await params
  const result = await authenticatedTransaction(
    async ({ transaction }) => {
      const purchase = (
        await selectPurchaseById(id, transaction)
      ).unwrap()

      if (!purchase) {
        return null
      }

      const customer = (
        await selectCustomerById(purchase.customerId, transaction)
      ).unwrap()

      const price = purchase.priceId
        ? (
            await selectPriceById(purchase.priceId, transaction)
          ).unwrap()
        : null

      const product =
        price && Price.hasProductId(price)
          ? (
              await selectProductById(price.productId, transaction)
            ).unwrap()
          : null

      return {
        purchase,
        customer,
        price,
        product,
      }
    }
  )

  if (!result || !result.purchase || !result.customer) {
    notFound()
  }

  const { purchase, customer, price, product } = result

  return (
    <InnerPurchasePage
      purchase={purchase}
      customer={customer}
      price={price}
      product={product}
    />
  )
}

export default PurchasePage
