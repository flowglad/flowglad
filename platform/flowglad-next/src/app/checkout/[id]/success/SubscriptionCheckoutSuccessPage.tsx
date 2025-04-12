import { adminTransaction } from '@/db/adminTransaction'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import { Organization } from '@/db/schema/organizations'
import { Price } from '@/db/schema/prices'
import SuccessPageContainer from '@/components/SuccessPageContainer'

interface SubscriptionCheckoutSuccessPageProps {
  checkoutSession: CheckoutSession.Record
  price?: Price.Record
  organization?: Organization.Record
}

const SubscriptionCheckoutSuccessPage = async ({
  checkoutSession,
  price,
  organization,
}: SubscriptionCheckoutSuccessPageProps) => {
  // Handle case where priceId could be null
  if (!checkoutSession.priceId) {
    throw new Error('No price ID found for checkout session')
  }

  let org = organization
  let prc = price

  // If we don't have the price and organization, fetch them
  if (!org || !prc) {
    const result = await adminTransaction(async ({ transaction }) => {
      const [data] =
        await selectPriceProductAndOrganizationByPriceWhere(
          { id: checkoutSession.priceId! },
          transaction
        )
      return data
    })

    if (!org) org = result.organization
    if (!prc) prc = result.price
  }

  return (
    <SuccessPageContainer
      title="Thanks for subscribing"
      message={`A payment to ${org.name} will appear on your statement.`}
    />
  )
}

export default SubscriptionCheckoutSuccessPage
