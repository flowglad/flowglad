import { headers } from 'next/headers'
import { merchantAuth, customerAuth } from '@/utils/auth'
import { clearCustomerBillingPortalOrganizationId } from '@/utils/customerBillingPortalState'
import { publicProcedure } from '../trpc'

/**
 * Merchant logout - clears only merchant session cookie.
 * Does NOT clear customer session.
 */
export const logoutMerchant = publicProcedure.mutation(async () => {
  await merchantAuth.api.signOut({
    headers: await headers(),
  })
  return { success: true }
})

/**
 * Customer logout - clears only customer session cookie.
 * Does NOT clear merchant session.
 */
export const logoutCustomer = publicProcedure.mutation(async () => {
  await clearCustomerBillingPortalOrganizationId()
  await customerAuth.api.signOut({
    headers: await headers(),
  })
  return { success: true }
})

/**
 * @deprecated Use logoutMerchant or logoutCustomer instead.
 * Backward compatibility export - defaults to merchant logout.
 */
export const logout = logoutMerchant
