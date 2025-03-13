import { notFound } from 'next/navigation'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { selectCustomerProfileAndCustomerTableRows } from '@/db/tableMethods/customerProfileMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import InternalCustomerDetailsScreen from './InternalCustomerDetailsScreen'
import { selectPurchases } from '@/db/tableMethods/purchaseMethods'
import { selectVariantsAndProductsForOrganization } from '@/db/tableMethods/variantMethods'
import { selectPaymentsBycustomerProfileId } from '@/db/tableMethods/paymentMethods'
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
      const variants = await selectVariantsAndProductsForOrganization(
        {},
        result.customerProfile.organizationId,
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
