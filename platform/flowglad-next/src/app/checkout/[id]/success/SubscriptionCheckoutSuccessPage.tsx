import { adminTransaction } from '@/db/adminTransaction'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import { Organization } from '@/db/schema/organizations'
import { Price } from '@/db/schema/prices'
import SuccessPageContainer from '@/components/SuccessPageContainer'
import { PriceType } from '@/types'
import { selectSubscriptions } from '@/db/tableMethods/subscriptionMethods'

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

  let innerOrganization = organization
  let innerPrice = price

  // If we don't have the price and organization, fetch them
  if (!innerOrganization || !innerPrice) {
    const result = await adminTransaction(async ({ transaction }) => {
      const [data] =
        await selectPriceProductAndOrganizationByPriceWhere(
          { id: checkoutSession.priceId! },
          transaction
        )
      return data
    })

    if (!innerOrganization) {
      innerOrganization = result.organization
    }
    if (!innerPrice) {
      innerPrice = result.price
    }
  }
  if (innerPrice?.type === PriceType.Usage) {
    return (
      <SuccessPageContainer
        title="Thanks for subscribing"
        message={`A payment to ${innerOrganization.name} will appear on your statement, based on your usage.`}
      />
    )
  }
  return (
    <SuccessPageContainer
      title="Thanks for subscribing"
      message={`A payment to ${innerOrganization.name} will appear on your statement.`}
    />
  )
}

export default SubscriptionCheckoutSuccessPage
