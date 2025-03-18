import Internal from './Internal'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { selectCustomerAndCustomerTableRows } from '@/db/tableMethods/customerMethods'
import { selectPricesAndProductsForOrganization } from '@/db/tableMethods/priceMethods'

const CustomersPage = async ({
  params,
}: {
  params: Promise<{ focusedTab: string }>
}) => {
  const { customers, variants } = await authenticatedTransaction(
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
      // Then, use the organizationId to fetch customers
      const customers = await selectCustomerAndCustomerTableRows(
        { organizationId: organization.id },
        transaction
      )
      const variants = await selectPricesAndProductsForOrganization(
        {},
        organization.id,
        transaction
      )
      return { customers, variants }
    }
  )

  return (
    <Internal
      params={await params}
      customers={customers}
      prices={variants.filter(({ product }) => product.active)}
    />
  )
}

export default CustomersPage
