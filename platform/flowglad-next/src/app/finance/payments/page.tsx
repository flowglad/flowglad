import Internal from './InternalPaymentsPage'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { selectPaymentsTableRowData } from '@/db/tableMethods/paymentMethods'

const PaymentsPage = async ({
  params,
}: {
  params: { focusedTab: string }
}) => {
  const { paymentRows } = await authenticatedTransaction(
    async ({ transaction, userId }) => {
      // First, get the user's membership and organization
      const [{ organization }] =
        await selectMembershipAndOrganizations(
          {
            userId,
            focused: true,
          },
          transaction
        )
      const paymentRows = await selectPaymentsTableRowData(
        organization.id,
        transaction
      )
      return { paymentRows }
    }
  )

  return <Internal payments={paymentRows} />
}

export default PaymentsPage
