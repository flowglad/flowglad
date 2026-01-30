import { Price } from '@db-core/schema/prices'
import { Result } from 'better-result'
import { notFound } from 'next/navigation'
import { authenticatedTransactionWithResult } from '@/db/authenticatedTransaction'
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
  const result = (
    await authenticatedTransactionWithResult(
      async ({ transaction }) => {
        const purchase = (
          await selectPurchaseById(id, transaction)
        ).unwrap()

        if (!purchase) {
          return Result.ok(null)
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

        return Result.ok({
          purchase,
          customer,
          price,
          product,
        })
      }
    )
  ).unwrap()

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
