/**
 * Auth module exports.
 * This module provides both merchant and customer authentication instances.
 */

export * from './constants'
export * from './customerAuth'
export * from './merchantAuth'
// Re-export merchant auth as default for backward compatibility
export {
  getMerchantSession as getSession,
  merchantAuth as auth,
} from './merchantAuth'
export * from './shared'
