/**
 * Auth client module - re-exports from the new modular structure.
 *
 * This file exists for backward compatibility.
 * New code should import from '@/utils/authClient/merchantAuthClient' or '@/utils/authClient/customerAuthClient' directly.
 *
 * @deprecated Import directly from '@/utils/authClient/merchantAuthClient' or '@/utils/authClient/customerAuthClient'
 */
export {
  // Backward compatibility - defaults to merchant
  authClient,
  // Customer auth client
  customerAuthClient,
  customerSignIn,
  customerSignOut,
  // Merchant auth client
  merchantAuthClient,
  merchantSignIn,
  merchantSignOut,
  merchantSignUp,
  signIn,
  signOut,
  signUp,
  useCustomerSession,
  useMerchantSession,
  useSession,
} from './authClient/index'
