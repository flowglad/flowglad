/**
 * Auth client module exports.
 * This module provides both merchant and customer authentication clients for client-side use.
 */

export * from './merchantAuthClient'
export * from './customerAuthClient'

// Re-export merchant auth client as default for backward compatibility
export {
  merchantAuthClient as authClient,
  merchantSignIn as signIn,
  merchantSignOut as signOut,
  merchantSignUp as signUp,
  useMerchantSession as useSession,
} from './merchantAuthClient'
