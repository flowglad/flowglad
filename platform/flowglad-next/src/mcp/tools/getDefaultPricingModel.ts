import { ToolConstructor } from '../toolWrap'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere } from '@/db/tableMethods/pricingModelMethods'

const getDefaultPricingModelSchema = {}

export const getDefaultPricingModel: ToolConstructor<
  typeof getDefaultPricingModelSchema
> = {
  name: 'getDefaultPricingModel',
  description: 'Get the default pricingModel for the organization',
  schema: getDefaultPricingModelSchema,
  callbackConstructor: (apiKey: string) => async () => {
    const [pricingModel] = await authenticatedTransaction(
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
          text: `Default pricingModel: ${JSON.stringify(pricingModel ?? {})}`,
        },
      ],
    }
  },
}
