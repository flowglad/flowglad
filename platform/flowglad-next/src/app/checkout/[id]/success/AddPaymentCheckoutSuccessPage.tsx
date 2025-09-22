import { adminTransaction } from '@/db/adminTransaction'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import SuccessPageContainer from '@/components/SuccessPageContainer'
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
      const { price, organization } =
        await adminTransaction(async ({ transaction }) => {
          const subscription = await selectSubscriptionById(
            targetSubscriptionId,
            transaction
          )
          if (!subscription.priceId) {
            throw new Error('No price ID found for subscription')
          }
          // Get the price and organization
          const [data] =
            await selectPriceProductAndOrganizationByPriceWhere(
              { id: subscription.priceId },
              transaction
            )

          return {
            subscription,
            price: data.price,
            organization: data.organization,
          }
        })

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
