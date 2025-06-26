import { z } from 'zod'
import { ToolConstructor } from '../toolWrap'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectCatalogsWithProductsAndUsageMetersByCatalogWhere } from '@/db/tableMethods/catalogMethods'

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
        return selectCatalogsWithProductsAndUsageMetersByCatalogWhere(
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
