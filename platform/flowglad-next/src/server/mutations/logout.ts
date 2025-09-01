import { auth } from '@/utils/auth'
import { publicProcedure } from '../trpc'
import { clearCustomerBillingPortalOrganizationId } from '@/utils/customerBillingPortalState'
import { headers } from 'next/headers'

export const logout = publicProcedure.mutation(async () => {
  await clearCustomerBillingPortalOrganizationId()
  await auth.api.signOut({
    headers: await headers(),
  })
  return { success: true }
})