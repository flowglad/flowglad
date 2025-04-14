import { authenticatedTransaction } from '@/db/databaseMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { selectPricesAndProductsForOrganization } from '@/db/tableMethods/priceMethods'
import Internal from './Internal'

const CustomersPage = async ({
  params,
}: {
  params: Promise<{ focusedTab: string }>
}) => {
  const { organizationId, variants } = await authenticatedTransaction(
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

      const variants = await selectPricesAndProductsForOrganization(
        {},
        organization.id,
        transaction
      )

      return { organizationId: organization.id, variants }
    }
  )

  return <Internal />
}

export default CustomersPage
