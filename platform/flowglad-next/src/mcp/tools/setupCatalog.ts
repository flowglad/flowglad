import { setupCatalogSchema } from '@/utils/catalogs/setupSchemas'
import { ToolConstructor } from '../toolWrap'
import { setupCatalogTransaction } from '@/utils/catalogs/setupTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectFocusedMembershipAndOrganization } from '@/db/tableMethods/membershipMethods'

const schema = {
  catalog: setupCatalogSchema,
}

const constructCatalogSuccessContext = (
  result: Awaited<ReturnType<typeof setupCatalogTransaction>>
): string => {
  const productSlugs = result.products
    .map((product) => product.slug!)
    .join(', ')
  const priceSlugs = result.prices
    .map((price) => price.slug!)
    .join(', ')
  const featureSlugs = result.features
    .map((feature) => feature.slug!)
    .join(', ')

  const usageMeterSlugs = result.usageMeters
    .map((usageMeter) => usageMeter.slug!)
    .join(', ')

  return `Catalog set up successfully: https://app.flowglad.com/store/catalogs/${result.catalog.id}
Here are the slugs for the products, prices, features, and usage meters:
Products: ${productSlugs}
Prices: ${priceSlugs}
Features: ${featureSlugs}
Usage Meters: ${usageMeterSlugs}`
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
          text: constructCatalogSuccessContext(result),
        },
      ],
    }
  },
}
