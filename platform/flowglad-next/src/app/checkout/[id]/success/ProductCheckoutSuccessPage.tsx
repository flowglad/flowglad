import { adminTransaction } from '@/db/adminTransaction'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import { PriceType } from '@/types'
import SuccessPageContainer from '@/components/SuccessPageContainer'
import SubscriptionCheckoutSuccessPage from './SubscriptionCheckoutSuccessPage'

interface ProductCheckoutSuccessPageProps {
  product: CheckoutSession.Record
}

const ProductCheckoutSuccessPage = async ({
  product,
}: ProductCheckoutSuccessPageProps) => {
  // If there's no priceId, just show a generic success message
  if (!product.priceId) {
    return (
      <SuccessPageContainer
        title="Product Purchase Successful"
        message="Thank you for purchase"
      />
    )
  }

  // Get the price and organization to check if it's a subscription
  const { price, organization } = await adminTransaction(
    async ({ transaction }) => {
      const [data] =
        await selectPriceProductAndOrganizationByPriceWhere(
          { id: product.priceId! },
          transaction
        )
      return { price: data.price, organization: data.organization }
    }
  )

  // If the price is a subscription or usage type, render the subscription success page
  if (
    price.type === PriceType.Subscription ||
    price.type === PriceType.Usage
  ) {
    return (
      <SubscriptionCheckoutSuccessPage
        checkoutSession={product}
        price={price}
        organization={organization}
      />
    )
  }

  // Otherwise, show a generic product purchase success message
  return (
    <SuccessPageContainer
      title="Product Purchase Successful"
      message={`Thank you for purchasing from ${organization.name}. Your order has been processed successfully.`}
    />
  )
}

export default ProductCheckoutSuccessPage
