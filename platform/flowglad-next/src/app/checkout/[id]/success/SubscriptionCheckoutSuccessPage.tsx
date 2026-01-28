import { Result } from 'better-result'
import SuccessPageContainer from '@/components/SuccessPageContainer'
import { adminTransaction } from '@/db/adminTransaction'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { Organization } from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { PriceType } from '@/types'

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
    const txResult = await adminTransaction(
      async ({ transaction }) => {
        const [data] =
          await selectPriceProductAndOrganizationByPriceWhere(
            { id: checkoutSession.priceId! },
            transaction
          )
        return Result.ok(data)
      }
    )
    const result = txResult.unwrap()

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
    const customerTxResult = await adminTransaction(
      async ({ transaction }) => {
        const innerResult = await selectCustomerById(
          checkoutSession.customerId!,
          transaction
        )
        return Result.ok(innerResult.unwrap())
      }
    )
    const customer = customerTxResult.unwrap()
    customerEmail = customer.email || null
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
