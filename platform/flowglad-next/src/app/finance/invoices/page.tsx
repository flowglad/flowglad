import Internal from './InternalInvoicesPage'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'

const InvoicesPage = async ({
  params,
}: {
  params: { focusedTab: string }
}) => {
  const { invoices } = await authenticatedTransaction(
    async ({ transaction, userId }) => {
      // First, get the user's membership and organization
      const [{ organization }] =
        await selectMembershipAndOrganizations(
          {
            UserId: userId,
            focused: true,
          },
          transaction
        )
      const invoices =
        await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
          { organizationId: organization.id },
          transaction
        )
      return { invoices }
    }
  )

  return <Internal invoices={invoices} />
}

export default InvoicesPage
