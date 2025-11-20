import { adminTransaction } from '@/db/adminTransaction'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import { Organization } from '@/db/schema/organizations'
import { Price } from '@/db/schema/prices'
import SuccessPageContainer from '@/components/SuccessPageContainer'
import { PriceType } from '@/types'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'

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

  // Get customer email from customer record (same source the email system uses)
  let customerEmail: string | null = null
  if (checkoutSession.customerId) {
    const customer = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomerById(
          checkoutSession.customerId!,
          transaction
        )
      }
    )
    customerEmail = customer?.email || null
  }

  if (innerPrice?.type === PriceType.Usage) {
    return (
      <SuccessPageContainer
        title="Thanks for subscribing"
        message={`A payment to ${innerOrganization.name} will appear on your statement, based on your usage.`}
        customerEmail={customerEmail}
      />
    )
  }
  return (
    <SuccessPageContainer
      title="Thanks for subscribing"
      message={`A payment to ${innerOrganization.name} will appear on your statement.`}
      customerEmail={customerEmail}
    />
  )
}

export default SubscriptionCheckoutSuccessPage
