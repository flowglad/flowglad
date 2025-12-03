import { notFound } from 'next/navigation'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectCustomerAndCustomerTableRows } from '@/db/tableMethods/customerMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { selectPayments } from '@/db/tableMethods/paymentMethods'
import { selectPricesAndProductsForOrganization } from '@/db/tableMethods/priceMethods'
import { selectPurchases } from '@/db/tableMethods/purchaseMethods'
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
      if (!result) {
        return notFound()
      }
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
