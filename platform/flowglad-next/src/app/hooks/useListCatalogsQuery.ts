import { trpc } from '../_trpc/client'
import { encodeCursor } from '@/db/tableUtils'
import { useAuthContext } from '@/contexts/authContext'

export const useListCatalogsQuery = () => {
  const { organization } = useAuthContext()
  return trpc.catalogs.list.useQuery({
    limit: 100,
    cursor: encodeCursor({
      parameters: {
        organizationId: organization!.id,
      },
    }),
  })
}
