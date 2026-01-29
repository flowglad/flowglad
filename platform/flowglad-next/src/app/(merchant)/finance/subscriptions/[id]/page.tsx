import { Price } from '@db-core/schema/prices'
import { notFound } from 'next/navigation'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectPricingModelById } from '@/db/tableMethods/pricingModelMethods'
import {
  selectProductById,
  selectProducts,
} from '@/db/tableMethods/productMethods'
import { selectRichSubscriptionsAndActiveItems } from '@/db/tableMethods/subscriptionItemMethods.server'
import { subscriptionWithCurrent } from '@/db/tableMethods/subscriptionMethods'
import InnerSubscriptionPage from './InnerSubscriptionPage'

const SubscriptionPage = async ({
  params,
}: {
  params: Promise<{ id: string }>
}) => {
  const { id } = await params
  const result = await authenticatedTransaction(
    async ({ transaction, cacheRecomputationContext }) => {
      const [subscription] =
        await selectRichSubscriptionsAndActiveItems(
          { id },
          transaction,
          cacheRecomputationContext
        )

      if (!subscription) {
        return null
      }

      const defaultPaymentMethod = subscription.defaultPaymentMethodId
        ? (
            await selectPaymentMethodById(
              subscription.defaultPaymentMethodId,
              transaction
            )
          ).unwrap()
        : null

      const customer = (
        await selectCustomerById(subscription.customerId, transaction)
      ).unwrap()

      let product = null
      let pricingModel = null

      if (subscription.priceId) {
        const price = (
          await selectPriceById(subscription.priceId, transaction)
        ).unwrap()
        if (Price.hasProductId(price)) {
          product = (
            await selectProductById(price.productId, transaction)
          ).unwrap()
        }
      } else if (subscription.subscriptionItems.length > 0) {
        // Fallback: if no main price is set, use the product from the first item
        const firstPrice = subscription.subscriptionItems[0].price
        if (firstPrice && Price.clientHasProductId(firstPrice)) {
          product = (
            await selectProductById(firstPrice.productId, transaction)
          ).unwrap()
        }
      }

      if (product && product.pricingModelId) {
        pricingModel = (
          await selectPricingModelById(
            product.pricingModelId,
            transaction
          )
        ).unwrap()
      }

      // Fetch all products for subscription items (only for prices with productId)
      const productIds = subscription.subscriptionItems
        .filter((item) => Price.clientHasProductId(item.price))
        .map((item) => {
          // After filter, we know this is a product price with productId
          const typedPrice = item.price as
            | Price.ClientSubscriptionRecord
            | Price.ClientSinglePaymentRecord
          return typedPrice.productId
        })
      const uniqueProductIds = [...new Set(productIds)]
      const products =
        uniqueProductIds.length > 0
          ? await selectProducts(
              { id: uniqueProductIds },
              transaction
            )
          : []

      // Create a record of productId to product name (plain object for serialization)
      const productNames: Record<string, string> = Object.fromEntries(
        products.map((p) => [p.id, p.name])
      )

      return {
        subscription,
        defaultPaymentMethod,
        customer,
        product,
        pricingModel,
        productNames,
      }
    }
  )

  if (!result) {
    notFound()
  }

  const {
    subscription,
    defaultPaymentMethod,
    customer,
    product,
    pricingModel,
    productNames,
  } = result
  return (
    <InnerSubscriptionPage
      subscription={subscriptionWithCurrent(subscription)}
      defaultPaymentMethod={defaultPaymentMethod ?? null}
      customer={customer}
      pricingModel={pricingModel}
      productNames={productNames}
    />
  )
}

export default SubscriptionPage
