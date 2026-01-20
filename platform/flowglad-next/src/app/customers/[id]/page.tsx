import { notFound } from 'next/navigation'
import { authenticatedTransactionUnwrap } from '@/db/authenticatedTransaction'
import { selectCustomerAndCustomerTableRows } from '@/db/tableMethods/customerMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { selectPayments } from '@/db/tableMethods/paymentMethods'
import { selectPricesAndProductsForOrganization } from '@/db/tableMethods/priceMethods'
import { selectUsageEvents } from '@/db/tableMethods/usageEventMethods'
import InternalCustomerDetailsScreen from './InternalCustomerDetailsScreen'

export type CustomerPageParams = {
  id: string
}

const CustomerPage = async ({
  params,
}: {
  params: Promise<CustomerPageParams>
}) => {
  const { id } = await params
  const result = await authenticatedTransactionUnwrap(
    async ({ transaction, userId }) => {
      await selectMembershipAndOrganizations(
        {
          userId,
          focused: true,
        },
        transaction
      )

      // Then, use the organizationId to fetch customer
      const [customerResult] =
        await selectCustomerAndCustomerTableRows({ id }, transaction)
      if (!customerResult) {
        return null
      }
      const paymentsForCustomer = await selectPayments(
        {
          customerId: customerResult.customer.id,
        },
        transaction
      )
      const prices = await selectPricesAndProductsForOrganization(
        {},
        customerResult.customer.organizationId,
        transaction
      )
      const usageEvents = await selectUsageEvents(
        {
          customerId: customerResult.customer.id,
        },
        transaction
      )
      return {
        customer: customerResult.customer,
        prices,
        paymentsForCustomer,
        usageEvents,
      }
    }
  )

  if (!result) {
    notFound()
  }

  const { customer, prices, paymentsForCustomer, usageEvents } =
    result

  return (
    <InternalCustomerDetailsScreen
      customer={customer}
      prices={prices
        .filter(({ product }) => product.active)
        .map(({ price }) => price)}
      payments={paymentsForCustomer}
      usageEvents={usageEvents}
    />
  )
}

export default CustomerPage
