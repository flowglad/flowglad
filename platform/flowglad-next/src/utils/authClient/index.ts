/**
 * Auth client module exports.
 * Provides both merchant and customer auth clients with their helpers.
 *
 * For backward compatibility:
 * - `authClient` is aliased to `merchantAuthClient`
 * - `signIn`, `signOut`, `signUp`, `useSession` are aliased to merchant equivalents
 */

// Customer auth client
export {
  customerAuthClient,
  customerSignIn,
  customerSignOut,
  useCustomerSession,
} from './customerAuthClient'
// Merchant auth client (default for backward compatibility)
// Backward compatibility aliases
export {
  merchantAuthClient,
  merchantAuthClient as authClient,
  merchantSignIn,
  merchantSignIn as signIn,
  merchantSignOut,
  merchantSignOut as signOut,
  merchantSignUp,
  merchantSignUp as signUp,
  useMerchantSession,
  useMerchantSession as useSession,
} from './merchantAuthClient'
