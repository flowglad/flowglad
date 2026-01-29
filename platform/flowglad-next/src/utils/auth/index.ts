/**
 * Backward compatibility exports.
 * New code should import from merchantAuth or customerAuth directly.
 */
export * from './constants'
export * from './shared'
export * from './merchantAuth'
export * from './customerAuth'

// Default to merchant auth for backward compatibility
export { merchantAuth as auth, getMerchantSession as getSession } from './merchantAuth'
