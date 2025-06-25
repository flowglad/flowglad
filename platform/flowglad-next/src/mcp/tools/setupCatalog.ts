import { setupCatalogSchema } from '@/utils/catalogs/setupSchemas'
import { ToolConstructor } from '../toolWrap'
import { setupCatalogTransaction } from '@/utils/catalog'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectFocusedMembershipAndOrganization } from '@/db/tableMethods/membershipMethods'

const schema = {
  catalog: setupCatalogSchema,
}

export const setupCatalog: ToolConstructor<typeof schema> = {
  name: 'setupCatalog',
  description: 'Setup a catalog',
  schema: {
    catalog: setupCatalogSchema,
  },
  callbackConstructor: (apiKey: string) => async (params) => {
    const result = await authenticatedTransaction(
      async ({ transaction, livemode, userId }) => {
        const { organization } =
          await selectFocusedMembershipAndOrganization(
            userId,
            transaction
          )
        if (!organization) {
          throw new Error('No focused membership found')
        }
        return await setupCatalogTransaction(
          {
            input: params.catalog,
            organizationId: organization.id,
            livemode: livemode,
          },
          transaction
        )
      },
      {
        apiKey,
      }
    )
    return {
      content: [
        {
          type: 'text',
          text: `Catalog setup complete: https://app.flowglad.com/store/catalogs/${result.catalog.id}`,
        },
      ],
    }
  },
}
