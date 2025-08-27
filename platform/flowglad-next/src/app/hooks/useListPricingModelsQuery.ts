import { trpc } from '../_trpc/client'
import { encodeCursor } from '@/db/tableUtils'
import { useAuthContext } from '@/contexts/authContext'

export const useListPricingModelsQuery = () => {
  const { organization } = useAuthContext()
  return trpc.pricingModels.list.useQuery({
    limit: 100,
    cursor: encodeCursor({
      parameters: {
        organizationId: organization!.id,
      },
    }),
  })
}
