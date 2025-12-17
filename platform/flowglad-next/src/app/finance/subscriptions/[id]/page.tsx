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
import { selectRichSubscriptionsAndActiveItems } from '@/db/tableMethods/subscriptionItemMethods'
import { subscriptionWithCurrent } from '@/db/tableMethods/subscriptionMethods'
import InnerSubscriptionPage from './InnerSubscriptionPage'

const SubscriptionPage = async ({
  params,
}: {
  params: Promise<{ id: string }>
}) => {
  const { id } = await params
  const {
    subscription,
    defaultPaymentMethod,
    customer,
    product,
    pricingModel,
    productNames,
  } = await authenticatedTransaction(async ({ transaction }) => {
    const [subscription] =
      await selectRichSubscriptionsAndActiveItems({ id }, transaction)

    if (!subscription) {
      notFound()
    }

    const defaultPaymentMethod = subscription.defaultPaymentMethodId
      ? await selectPaymentMethodById(
          subscription.defaultPaymentMethodId,
          transaction
        )
      : null

    const customer = await selectCustomerById(
      subscription.customerId,
      transaction
    )

    let product = null
    let pricingModel = null

    if (subscription.priceId) {
      const price = await selectPriceById(
        subscription.priceId,
        transaction
      )
      product = await selectProductById(price.productId, transaction)
    } else if (subscription.subscriptionItems.length > 0) {
      // Fallback: if no main price is set, use the product from the first item
      const firstPrice = subscription.subscriptionItems[0].price
      if (firstPrice) {
        product = await selectProductById(
          firstPrice.productId,
          transaction
        )
      }
    }

    if (product && product.pricingModelId) {
      pricingModel = await selectPricingModelById(
        product.pricingModelId,
        transaction
      )
    }

    // Fetch all products for subscription items
    const productIds = [
      ...new Set(
        subscription.subscriptionItems.map(
          (item) => item.price.productId
        )
      ),
    ]
    const products =
      productIds.length > 0
        ? await selectProducts({ id: productIds }, transaction)
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
  })
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
