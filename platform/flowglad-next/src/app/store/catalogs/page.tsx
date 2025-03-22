import { authenticatedTransaction } from '@/db/databaseMethods'
import { selectCatalogsTableRows } from '@/db/tableMethods/catalogMethods'
import { selectFocusedMembershipAndOrganization } from '@/db/tableMethods/membershipMethods'
import InnerCatalogsPage from './InnerCatalogsPage'

export default async function CatalogsPage() {
  const catalogs = await authenticatedTransaction(
    async ({ transaction, userId, livemode }) => {
      const { membership } =
        await selectFocusedMembershipAndOrganization(
          userId,
          transaction
        )
      return selectCatalogsTableRows(
        { organizationId: membership.organizationId },
        transaction
      )
    }
  )

  return <InnerCatalogsPage catalogs={catalogs} />
}
