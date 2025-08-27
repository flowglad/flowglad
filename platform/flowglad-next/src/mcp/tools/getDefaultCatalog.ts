import { z } from 'zod'
import { ToolConstructor } from '../toolWrap'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere } from '@/db/tableMethods/pricingModelMethods'

const getDefaultCatalogSchema = {}

export const getDefaultCatalog: ToolConstructor<
  typeof getDefaultCatalogSchema
> = {
  name: 'getDefaultCatalog',
  description: 'Get the default catalog for the organization',
  schema: getDefaultCatalogSchema,
  callbackConstructor: (apiKey: string) => async () => {
    const [catalog] = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
          {
            isDefault: true,
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
          text: `Default catalog: ${JSON.stringify(catalog ?? {})}`,
        },
      ],
    }
  },
}
