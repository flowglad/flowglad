import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { subscriptionWithCurrent } from '@/db/tableMethods/subscriptionMethods'
import InnerSubscriptionPage from './InnerSubscriptionPage'
import { selectRichSubscriptionsAndActiveItems } from '@/db/tableMethods/subscriptionItemMethods'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectProductById } from '@/db/tableMethods/productMethods'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectPricingModelById } from '@/db/tableMethods/pricingModelMethods'

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
  } = await authenticatedTransaction(async ({ transaction }) => {
    const [subscription] =
      await selectRichSubscriptionsAndActiveItems({ id }, transaction)

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

    if (product) {
      pricingModel = await selectPricingModelById(
        product.pricingModelId,
        transaction
      )
    }

    return {
      subscription,
      defaultPaymentMethod,
      customer,
      product,
      pricingModel,
    }
  })
  return (
    <InnerSubscriptionPage
      subscription={subscriptionWithCurrent(subscription)}
      defaultPaymentMethod={defaultPaymentMethod ?? null}
      customer={customer}
      product={product}
      pricingModel={pricingModel}
    />
  )
}

export default SubscriptionPage
