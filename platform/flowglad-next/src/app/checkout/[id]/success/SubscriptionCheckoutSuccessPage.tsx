import { PriceType } from '@db-core/enums'
import type { CheckoutSession } from '@db-core/schema/checkoutSessions'
import type { Organization } from '@db-core/schema/organizations'
import type { Price } from '@db-core/schema/prices'
import { Result } from 'better-result'
import SuccessPageContainer from '@/components/SuccessPageContainer'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'

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
    const result = (
      await adminTransactionWithResult(async ({ transaction }) => {
        const [data] =
          await selectPriceProductAndOrganizationByPriceWhere(
            { id: checkoutSession.priceId! },
            transaction
          )
        if (!data) {
          return Result.err(
            new Error('Price or organization not found')
          )
        }
        return Result.ok(data)
      })
    ).unwrap()

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
    const customer = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return selectCustomerById(
          checkoutSession.customerId!,
          transaction
        )
      })
    ).unwrap()
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
