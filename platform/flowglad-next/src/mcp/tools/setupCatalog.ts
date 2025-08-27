import { setupPricingModelSchema } from '@/utils/catalogs/setupSchemas'
import { ToolConstructor } from '../toolWrap'
import { setupPricingModelTransaction } from '@/utils/catalogs/setupTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectFocusedMembershipAndOrganization } from '@/db/tableMethods/membershipMethods'

const schema = {
  pricingModel: setupPricingModelSchema,
}

const constructPricingModelSuccessContext = (
  result: Awaited<ReturnType<typeof setupPricingModelTransaction>>
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

  return `PricingModel set up successfully: https://app.flowglad.com/store/pricing-models/${result.pricingModel.id}
Here are the slugs for the products, prices, features, and usage meters:
Products: ${productSlugs}
Prices: ${priceSlugs}
Features: ${featureSlugs}
Usage Meters: ${usageMeterSlugs}`
}

export const setupPricingModel: ToolConstructor<typeof schema> = {
  name: 'setupPricingModel',
  description: 'Setup a catalog',
  schema: {
    pricingModel: setupPricingModelSchema,
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
        return await setupPricingModelTransaction(
          {
            input: params.pricingModel,
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
          text: constructPricingModelSuccessContext(result),
        },
      ],
    }
  },
}
