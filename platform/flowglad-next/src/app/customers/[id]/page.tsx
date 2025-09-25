import { notFound } from 'next/navigation'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectCustomerAndCustomerTableRows } from '@/db/tableMethods/customerMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import InternalCustomerDetailsScreen from './InternalCustomerDetailsScreen'
import { selectPurchases } from '@/db/tableMethods/purchaseMethods'
import { selectPricesAndProductsForOrganization } from '@/db/tableMethods/priceMethods'
import { selectPayments } from '@/db/tableMethods/paymentMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import { selectUsageEvents } from '@/db/tableMethods/usageEventMethods'

export type CustomerPageParams = {
  id: string
}

const CustomerPage = async ({
  params,
}: {
  params: Promise<CustomerPageParams>
}) => {
  const { id } = await params
  const {
    customer,
    purchases,
    invoices,
    prices,
    paymentsForCustomer,
    usageEvents,
  } = await authenticatedTransaction(
    async ({ transaction, userId }) => {
      await selectMembershipAndOrganizations(
        {
          userId,
          focused: true,
        },
        transaction
      )

      // Then, use the organizationId to fetch customer
      const [result] = await selectCustomerAndCustomerTableRows(
        { id },
        transaction
      )
      const purchases = await selectPurchases(
        {
          customerId: result.customer.id,
        },
        transaction
      )

      const invoices =
        await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
          { customerId: result.customer.id },
          transaction
        )
      const paymentsForCustomer = await selectPayments(
        {
          customerId: result.customer.id,
        },
        transaction
      )
      const prices = await selectPricesAndProductsForOrganization(
        {},
        result.customer.organizationId,
        transaction
      )
      const usageEvents = await selectUsageEvents(
        {
          customerId: result.customer.id,
        },
        transaction
      )
      return {
        customer: result.customer,
        purchases,
        invoices,
        prices,
        paymentsForCustomer,
        usageEvents,
      }
    }
  )

  if (!customer) {
    notFound()
  }

  return (
    <InternalCustomerDetailsScreen
      customer={customer}
      purchases={purchases}
      invoices={invoices}
      prices={prices
        .filter(({ product }) => product.active)
        .map(({ price }) => price)}
      payments={paymentsForCustomer}
      usageEvents={usageEvents}
    />
  )
}

export default CustomerPage
