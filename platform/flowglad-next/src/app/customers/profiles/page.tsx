import Internal from './Internal'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { selectCustomerProfileAndCustomerTableRows } from '@/db/tableMethods/customerProfileMethods'
import { selectPricesAndProductsForOrganization } from '@/db/tableMethods/priceMethods'

const CustomersPage = async ({
  params,
}: {
  params: Promise<{ focusedTab: string }>
}) => {
  const { customerProfiles, variants } =
    await authenticatedTransaction(
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
        // Then, use the organizationId to fetch customer profiles
        const customerProfiles =
          await selectCustomerProfileAndCustomerTableRows(
            { organizationId: organization.id },
            transaction
          )
        const variants = await selectPricesAndProductsForOrganization(
          {},
          organization.id,
          transaction
        )
        return { customerProfiles, variants }
      }
    )

  return (
    <Internal
      params={await params}
      customers={customerProfiles}
      prices={variants.filter(({ product }) => product.active)}
    />
  )
}

export default CustomersPage
