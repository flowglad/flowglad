import Internal from './InternalSubscriptionsPage'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { selectPaymentsTableRowData } from '@/db/tableMethods/paymentMethods'
import { selectSubscriptionsTableRowData } from '@/db/tableMethods/subscriptionMethods'

const SubscriptionsPage = async () => {
  const { subscriptionRows } = await authenticatedTransaction(
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
      const subscriptionRows = await selectSubscriptionsTableRowData(
        organization.id,
        transaction
      )
      return { subscriptionRows }
    }
  )

  return <Internal subscriptions={subscriptionRows} />
}

export default SubscriptionsPage
