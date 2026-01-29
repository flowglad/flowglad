/**
 * Auth module exports.
 * This module provides both merchant and customer authentication instances.
 */

export * from './constants'
export * from './shared'
export * from './merchantAuth'
export * from './customerAuth'

// Re-export merchant auth as default for backward compatibility
export { merchantAuth as auth, getMerchantSession as getSession } from './merchantAuth'
