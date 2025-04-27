import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import InnerPurchasesPage from './InnerPurchasesPage'

const PurchasesPage = async () => {
  const organizationId = await authenticatedTransaction(
    async ({ transaction, userId }) => {
      const memberships = await selectMembershipAndOrganizations(
        { userId, focused: true },
        transaction
      )
      if (memberships.length === 0) {
        throw new Error('No memberships found')
      }
      return memberships[0].organization.id
    }
  )

  return <InnerPurchasesPage organizationId={organizationId} />
}

export default PurchasesPage
