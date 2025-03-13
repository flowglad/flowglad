import Internal from './Internal'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { selectCustomerProfileAndCustomerTableRows } from '@/db/tableMethods/customerProfileMethods'
import { selectVariantsAndProductsForOrganization } from '@/db/tableMethods/variantMethods'

const CustomersPage = async ({
  params,
}: {
  params: { focusedTab: string }
}) => {
  const { customerProfiles, variants } =
    await authenticatedTransaction(
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
        // Then, use the organizationId to fetch customer profiles
        const customerProfiles =
          await selectCustomerProfileAndCustomerTableRows(
            { organizationId: organization.id },
            transaction
          )
        const variants =
          await selectVariantsAndProductsForOrganization(
            {},
            organization.id,
            transaction
          )
        return { customerProfiles, variants }
      }
    )

  return (
    <Internal
      params={params}
      customers={customerProfiles}
      variants={variants.filter(({ product }) => product.active)}
    />
  )
}

export default CustomersPage
