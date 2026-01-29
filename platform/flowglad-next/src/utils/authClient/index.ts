/**
 * Backward compatibility exports.
 * New code should import from merchantAuthClient or customerAuthClient directly.
 */
export * from './merchantAuthClient'
export * from './customerAuthClient'

// Default to merchant auth client for backward compatibility
export {
  merchantAuthClient as authClient,
  merchantSignIn as signIn,
  merchantSignOut as signOut,
  merchantSignUp as signUp,
  useMerchantSession as useSession,
} from './merchantAuthClient'
