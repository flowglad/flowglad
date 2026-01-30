/**
 * Auth module - re-exports from the new modular structure.
 *
 * This file exists for backward compatibility.
 * New code should import from '@/utils/auth/merchantAuth' or '@/utils/auth/customerAuth' directly.
 *
 * @deprecated Import directly from '@/utils/auth/merchantAuth' or '@/utils/auth/customerAuth'
 */
export {
  // Backward compatibility - `auth` and `getSession` default to merchant
  auth,
  // Constants
  CUSTOMER_AUTH_BASE_PATH,
  CUSTOMER_COOKIE_PREFIX,
  // Customer auth
  customerAuth,
  getCustomerSession,
  // Merchant auth
  getMerchantSession,
  getSession,
  MERCHANT_AUTH_BASE_PATH,
  MERCHANT_COOKIE_PREFIX,
  merchantAuth,
} from './auth/index'
