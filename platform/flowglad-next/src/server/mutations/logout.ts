import { headers } from 'next/headers'
import { auth } from '@/utils/auth'
import { clearCustomerBillingPortalOrganizationId } from '@/utils/customerBillingPortalState'
import { publicProcedure } from '../trpc'

export const logout = publicProcedure.mutation(async () => {
  await clearCustomerBillingPortalOrganizationId()
  await auth.api.signOut({
    headers: await headers(),
  })
  return { success: true }
})
