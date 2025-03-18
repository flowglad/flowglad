import { notFound } from 'next/navigation'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { selectCustomerProfileAndCustomerTableRows } from '@/db/tableMethods/customerProfileMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import InternalCustomerDetailsScreen from './InternalCustomerDetailsScreen'
import { selectPurchases } from '@/db/tableMethods/purchaseMethods'
import { selectPricesAndProductsForOrganization } from '@/db/tableMethods/priceMethods'
import { selectPaymentsBycustomerProfileId } from '@/db/tableMethods/paymentMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'

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
    customerProfile,
    purchases,
    invoices,
    prices,
    paymentsForCustomer,
  } = await authenticatedTransaction(
    async ({ transaction, userId }) => {
      await selectMembershipAndOrganizations(
        {
          userId,
          focused: true,
        },
        transaction
      )

      // Then, use the organizationId to fetch customer profiles
      const [result] =
        await selectCustomerProfileAndCustomerTableRows(
          { id },
          transaction
        )
      const purchases = await selectPurchases(
        {
          customerProfileId: result.customerProfile.id,
        },
        transaction
      )

      const invoices =
        await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
          { customerProfileId: result.customerProfile.id },
          transaction
        )
      const paymentsForCustomer =
        await selectPaymentsBycustomerProfileId(
          result.customerProfile.id,
          transaction
        )
      const prices = await selectPricesAndProductsForOrganization(
        {},
        result.customerProfile.organizationId,
        transaction
      )
      return {
        customerProfile: result.customerProfile,
        purchases,
        invoices,
        prices,
        paymentsForCustomer,
      }
    }
  )

  if (!customerProfile) {
    notFound()
  }

  return (
    <InternalCustomerDetailsScreen
      customerProfile={customerProfile}
      purchases={purchases}
      invoices={invoices}
      prices={prices
        .filter(({ product }) => product.active)
        .map(({ price }) => price)}
      payments={paymentsForCustomer}
    />
  )
}

export default CustomerPage
