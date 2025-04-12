import { adminTransaction } from '@/db/adminTransaction'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import { PriceType } from '@/types'
import SuccessPageContainer from '@/components/SuccessPageContainer'
import SubscriptionCheckoutSuccessPage from './SubscriptionCheckoutSuccessPage'

interface PurchaseCheckoutSuccessPageProps {
  checkoutSession: CheckoutSession.Record
}

const PurchaseCheckoutSuccessPage = async ({
  checkoutSession,
}: PurchaseCheckoutSuccessPageProps) => {
  // If there's no priceId, just show a generic success message
  if (!checkoutSession.priceId) {
    return (
      <SuccessPageContainer
        title="Purchase Successful"
        message="Thank you for your purchase. Your order has been processed successfully."
      />
    )
  }

  // Get the price and organization to check if it's a subscription
  const { price, organization } = await adminTransaction(
    async ({ transaction }) => {
      const [data] =
        await selectPriceProductAndOrganizationByPriceWhere(
          { id: checkoutSession.priceId! },
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
        checkoutSession={checkoutSession}
        price={price}
        organization={organization}
      />
    )
  }

  // Otherwise, show a generic purchase success message
  return (
    <SuccessPageContainer
      title="Purchase Successful"
      message={`Thank you for your purchase from ${organization.name}. Your order has been processed successfully.`}
    />
  )
}

export default PurchaseCheckoutSuccessPage
