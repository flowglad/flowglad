import { publicProcedure } from '../trpc'
import { clearCustomerBillingPortalOrganizationId } from '@/utils/customerBillingPortalState'

export const logout = publicProcedure.mutation(async () => {
  await clearCustomerBillingPortalOrganizationId()
  return { success: true }
})