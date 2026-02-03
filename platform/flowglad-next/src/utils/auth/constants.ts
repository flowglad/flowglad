/**
 * Shared constants for dual-scope auth sessions.
 * Cookie prefixes are used by both server-side auth instances and middleware.
 */

export const MERCHANT_COOKIE_PREFIX = 'merchant'
export const CUSTOMER_COOKIE_PREFIX = 'customer'

export const MERCHANT_AUTH_BASE_PATH = '/api/auth/merchant'
export const CUSTOMER_AUTH_BASE_PATH = '/api/auth/customer'
