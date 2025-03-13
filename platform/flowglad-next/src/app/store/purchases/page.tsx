import { authenticatedTransaction } from '@/db/databaseMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { selectPurchaseRowDataForOrganization } from '@/db/tableMethods/purchaseMethods'
import InnerPurchasesPage from './InnerPurchasesPage'

const PurchasesPage = async () => {
  const purchases = await authenticatedTransaction(
    async ({ transaction, userId }) => {
      const memberships = await selectMembershipAndOrganizations(
        { userId, focused: true },
        transaction
      )
      if (memberships.length === 0) {
        throw new Error('No memberships found')
      }
      const organizationId = memberships[0].organization.id
      return selectPurchaseRowDataForOrganization(
        organizationId,
        transaction
      )
    }
  )

  return <InnerPurchasesPage purchases={purchases} />
}

export default PurchasesPage
