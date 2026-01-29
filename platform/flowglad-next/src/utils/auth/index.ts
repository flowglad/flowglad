// Export constants
export * from './constants'

// Export shared configuration
export * from './shared'

// Export merchant auth
export * from './merchantAuth'

// Export customer auth
export * from './customerAuth'

// Re-export merchantAuth as 'auth' for backward compatibility
// This allows existing code that imports { auth } from '@/utils/auth' to continue working
export { merchantAuth as auth, getMerchantSession as getSession } from './merchantAuth'
