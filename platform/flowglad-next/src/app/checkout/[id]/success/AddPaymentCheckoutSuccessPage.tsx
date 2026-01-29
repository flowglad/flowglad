import type { CheckoutSession } from '@db-core/schema/checkoutSessions'
import { Result } from 'better-result'
import SuccessPageContainer from '@/components/SuccessPageContainer'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import SubscriptionCheckoutSuccessPage from './SubscriptionCheckoutSuccessPage'

interface AddPaymentCheckoutSuccessPageProps {
  checkoutSession: CheckoutSession.Record
}

const AddPaymentCheckoutSuccessPage = async ({
  checkoutSession,
}: AddPaymentCheckoutSuccessPageProps) => {
  // If there's a targetSubscriptionId, get the subscription and render the subscription success page
  const targetSubscriptionId = checkoutSession.targetSubscriptionId
  if (typeof targetSubscriptionId === 'string') {
    try {
      const { subscription, price, organization } = (
        await adminTransactionWithResult(async ({ transaction }) => {
          const subscription = (
            await selectSubscriptionById(
              targetSubscriptionId,
              transaction
            )
          ).unwrap()
          if (!subscription.priceId) {
            throw new Error('No price ID found for subscription')
          }
          // Get the price and organization
          const [data] =
            await selectPriceProductAndOrganizationByPriceWhere(
              { id: subscription.priceId },
              transaction
            )

          return Result.ok({
            subscription,
            price: data.price,
            organization: data.organization,
          })
        })
      ).unwrap()

      return (
        <SubscriptionCheckoutSuccessPage
          checkoutSession={checkoutSession}
          price={price}
          organization={organization}
        />
      )
    } catch (error) {
      // If there's an error, fall back to the generic success message
      console.error('Error fetching subscription details:', error)
    }
  }

  // Otherwise, show a generic payment method added success message
  return (
    <SuccessPageContainer
      title="Payment Method Added Successfully"
      message="Your payment method has been added to your account."
    />
  )
}

export default AddPaymentCheckoutSuccessPage
