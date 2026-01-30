import { Result } from 'better-result'
import { notFound } from 'next/navigation'
import { authenticatedTransactionWithResult } from '@/db/authenticatedTransaction'
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
  const result = (
    await authenticatedTransactionWithResult(
      async ({ transaction, userId }) => {
        // Verify user has membership access (authorization check)
        const memberships = await selectMembershipAndOrganizations(
          {
            userId,
            focused: true,
          },
          transaction
        )
        if (memberships.length === 0) {
          return Result.err(
            new Error(
              'User does not have a focused organization membership'
            )
          )
        }

        const organizationId = memberships[0].organization.id

        // Fetch customer scoped to the user's organization
        const [customerResult] =
          await selectCustomerAndCustomerTableRows(
            { id },
            organizationId,
            transaction
          )
        if (!customerResult) {
          return Result.ok(null)
        }
        const paymentsForCustomer = await selectPayments(
          {
            customerId: customerResult.customer.id,
          },
          transaction
        )
        const prices = await selectPricesAndProductsForOrganization(
          {},
          organizationId,
          transaction
        )
        const usageEvents = await selectUsageEvents(
          {
            customerId: customerResult.customer.id,
          },
          transaction
        )
        return Result.ok({
          customer: customerResult.customer,
          prices,
          paymentsForCustomer,
          usageEvents,
        })
      }
    )
  ).unwrap()

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
