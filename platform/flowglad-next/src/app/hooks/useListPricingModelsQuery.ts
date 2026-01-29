import { encodeCursor } from '@db-core/tableUtils'
import { useAuthContext } from '@/contexts/authContext'
import { trpc } from '../_trpc/client'

export const useListPricingModelsQuery = () => {
  const { organization } = useAuthContext()
  return trpc.pricingModels.list.useQuery({
    limit: `100`,
    cursor: encodeCursor({
      parameters: {
        organizationId: organization!.id,
      },
    }),
  })
}
