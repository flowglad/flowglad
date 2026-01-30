// Export constants
export * from './constants'
// Export customer auth
export * from './customerAuth'

// Export merchant auth
export * from './merchantAuth'
// Re-export merchantAuth as 'auth' for backward compatibility
// This allows existing code that imports { auth } from '@/utils/auth' to continue working
export {
  getMerchantSession as getSession,
  merchantAuth as auth,
} from './merchantAuth'
// Export shared configuration
export * from './shared'
