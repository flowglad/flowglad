import { PriceType } from '@db-core/enums'
import type { CheckoutSession } from '@db-core/schema/checkoutSessions'
import { Result } from 'better-result'
import SuccessPageContainer from '@/components/SuccessPageContainer'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import SubscriptionCheckoutSuccessPage from './SubscriptionCheckoutSuccessPage'

interface ProductCheckoutSuccessPageProps {
  product: CheckoutSession.Record
}

const ProductCheckoutSuccessPage = async ({
  product,
}: ProductCheckoutSuccessPageProps) => {
  // Get customer email from customer record (same source the email system uses)
  let customerEmail: string | null = null
  if (product.customerId) {
    const customer = (
      await adminTransactionWithResult(async ({ transaction }) => {
        const customerRecord = (
          await selectCustomerById(product.customerId!, transaction)
        ).unwrap()
        return Result.ok(customerRecord)
      })
    ).unwrap()
    customerEmail = customer?.email || null
  }

  // If there's no priceId, just show a generic success message
  if (!product.priceId) {
    return (
      <SuccessPageContainer
        title="Product Purchase Successful"
        message="Thank you for purchase"
        customerEmail={customerEmail}
      />
    )
  }

  // Get the price and organization to check if it's a subscription
  const { price, organization } = (
    await adminTransactionWithResult(async ({ transaction }) => {
      const [data] =
        await selectPriceProductAndOrganizationByPriceWhere(
          { id: product.priceId! },
          transaction
        )
      if (!data) {
        return Result.err(
          new Error('Price or organization not found')
        )
      }
      return Result.ok({
        price: data.price,
        organization: data.organization,
      })
    })
  ).unwrap()

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
      customerEmail={customerEmail}
    />
  )
}

export default ProductCheckoutSuccessPage
