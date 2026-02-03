import { cookies, headers } from 'next/headers'
import {
  CUSTOMER_COOKIE_PREFIX,
  MERCHANT_COOKIE_PREFIX,
} from '@/utils/auth/constants'
import { customerAuth } from '@/utils/auth/customerAuth'
import { merchantAuth } from '@/utils/auth/merchantAuth'
import { clearCustomerBillingPortalOrganizationId } from '@/utils/customerBillingPortalState'
import { publicProcedure } from '../trpc'

/**
 * Logout mutation for merchant users.
 * Clears the merchant session cookie only.
 * Customer session (if any) remains unaffected.
 */
export const logoutMerchant = publicProcedure.mutation(async () => {
  await merchantAuth.api.signOut({
    headers: await headers(),
  })
  // Explicitly clear merchant session cookies since TRPC can't forward Set-Cookie headers
  const cookieStore = await cookies()
  cookieStore.delete(`${MERCHANT_COOKIE_PREFIX}.session_token`)
  cookieStore.delete(`${MERCHANT_COOKIE_PREFIX}.session_data`)
  return { success: true }
})

/**
 * Logout mutation for customer billing portal users.
 * Clears the customer session cookie and the billing portal organization context.
 * Merchant session (if any) remains unaffected.
 */
export const logoutCustomer = publicProcedure.mutation(async () => {
  await clearCustomerBillingPortalOrganizationId()
  await customerAuth.api.signOut({
    headers: await headers(),
  })
  // Explicitly clear customer session cookies since TRPC can't forward Set-Cookie headers
  const cookieStore = await cookies()
  cookieStore.delete(`${CUSTOMER_COOKIE_PREFIX}.session_token`)
  cookieStore.delete(`${CUSTOMER_COOKIE_PREFIX}.session_data`)
  return { success: true }
})

/**
 * Legacy logout mutation for backward compatibility.
 * Clears both merchant session and customer billing portal state.
 * @deprecated Use logoutMerchant or logoutCustomer instead
 */
export const logout = publicProcedure.mutation(async () => {
  await clearCustomerBillingPortalOrganizationId()
  await merchantAuth.api.signOut({
    headers: await headers(),
  })
  return { success: true }
})
