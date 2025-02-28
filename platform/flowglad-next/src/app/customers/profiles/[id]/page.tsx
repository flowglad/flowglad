import { notFound } from 'next/navigation'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { selectCustomerProfileAndCustomerTableRows } from '@/db/tableMethods/customerProfileMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import InternalCustomerDetailsScreen from './InternalCustomerDetailsScreen'
import { selectPurchases } from '@/db/tableMethods/purchaseMethods'
import { selectVariantsAndProductsForOrganization } from '@/db/tableMethods/variantMethods'
import { selectPaymentsByCustomerProfileId } from '@/db/tableMethods/paymentMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'

export type CustomerPageParams = {
  id: string
}

const CustomerPage = async ({
  params: { id },
}: {
  params: CustomerPageParams
}) => {
  const {
    customer,
    customerProfile,
    purchases,
    invoices,
    variants,
    paymentsForCustomer,
  } = await authenticatedTransaction(
    async ({ transaction, userId }) => {
      await selectMembershipAndOrganizations(
        {
          UserId: userId,
          focused: true,
        },
        transaction
      )

      // Then, use the OrganizationId to fetch customer profiles
      const [result] =
        await selectCustomerProfileAndCustomerTableRows(
          { id },
          transaction
        )
      const purchases = await selectPurchases(
        {
          CustomerProfileId: result.customerProfile.id,
        },
        transaction
      )

      const invoices =
        await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
          { CustomerProfileId: result.customerProfile.id },
          transaction
        )
      const paymentsForCustomer =
        await selectPaymentsByCustomerProfileId(
          result.customerProfile.id,
          transaction
        )
      const variants = await selectVariantsAndProductsForOrganization(
        {},
        result.customerProfile.OrganizationId,
        transaction
      )
      return {
        customer: result.customer,
        customerProfile: result.customerProfile,
        purchases,
        invoices,
        variants,
        paymentsForCustomer,
      }
    }
  )

  if (!customer) {
    notFound()
  }

  return (
    <InternalCustomerDetailsScreen
      customer={customer}
      customerProfile={customerProfile}
      purchases={purchases}
      invoices={invoices}
      variants={variants
        .filter(({ product }) => product.active)
        .map(({ variant }) => variant)}
      payments={paymentsForCustomer}
    />
  )
}

export default CustomerPage
