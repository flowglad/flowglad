import { trpc } from '@/app/_trpc/client'

export const useListUsageMetersQuery = () => {
  return trpc.usageMeters.list.useQuery({})
}
