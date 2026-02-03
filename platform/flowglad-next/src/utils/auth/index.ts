/**
 * Auth module exports.
 * Provides both merchant and customer auth instances with their helpers.
 *
 * For backward compatibility:
 * - `auth` is aliased to `merchantAuth`
 * - `getSession` is aliased to `getMerchantSession`
 */

// Constants
export {
  CUSTOMER_AUTH_BASE_PATH,
  CUSTOMER_COOKIE_PREFIX,
  MERCHANT_AUTH_BASE_PATH,
  MERCHANT_COOKIE_PREFIX,
} from './constants'
// Customer auth
export { customerAuth, getCustomerSession } from './customerAuth'
// Merchant auth (default for backward compatibility)
// Backward compatibility aliases
export {
  getMerchantSession,
  getMerchantSession as getSession,
  merchantAuth,
  merchantAuth as auth,
} from './merchantAuth'
