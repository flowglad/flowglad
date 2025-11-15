export interface CoreCustomerUser {
  externalId: string
  name: string
  email: string
}

export type GetRequestingCustomer = () => Promise<CoreCustomerUser>

export interface FlowgladServerSessionParamsCore {
  getRequestingCustomer?: GetRequestingCustomer
  baseURL?: string
  apiKey?: string
}

interface SupabaseClient {
  auth: {
    getUser: () => Promise<
      | {
          data: {
            user: {
              id: string
              email?: string
              phone?: string
              user_metadata: {
                [key: string]: any
              }
            }
          }
        }
      | {
          data: {
            user: null
          }
          error: any
        }
    >
  }
}

export interface SupabaseFlowgladServerSessionParams
  extends FlowgladServerSessionParamsCore {
  supabaseAuth: {
    client: () => Promise<SupabaseClient> | SupabaseClient
  }
}

interface NextAuthSession {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
  }
}

export interface NextjsAuthFlowgladServerSessionParams
  extends FlowgladServerSessionParamsCore {
  nextAuth: {
    auth: () => Promise<NextAuthSession | null>
    customerFromAuth?: (
      session: NextAuthSession
    ) => Promise<CoreCustomerUser | null>
  }
}

interface BetterAuthSession {
  user: {
    id: string
    name?: string | null
    email?: string | null
    image?: string | null
  }
}

export interface BetterAuthFlowgladServerSessionParams
  extends FlowgladServerSessionParamsCore {
  betterAuth: {
    /**
     * the getSession function from the BetterAuth client.
     */
    getSession: () => Promise<BetterAuthSession | null>
    /**
     * Extracts the customer parameters from the session object.
     */
    customerFromSession?: (
      session: BetterAuthSession
    ) => Promise<CoreCustomerUser | null>
  }
}

export interface BaseFlowgladServerSessionParams
  extends FlowgladServerSessionParamsCore {
  getRequestingCustomer: GetRequestingCustomer
}

interface ClerkEmailAddress {
  emailAddress: string
}

interface ClerkUser {
  id: string
  firstName: string | null
  lastName: string | null
  username: string | null
  emailAddresses: ClerkEmailAddress[]
}

export interface ClerkFlowgladServerSessionParams
  extends FlowgladServerSessionParamsCore {
  clerk: {
    currentUser: () => Promise<ClerkUser | null>
    customerFromCurrentUser?: (
      currentUser: ClerkUser
    ) => Promise<CoreCustomerUser | null>
  }
}

export type FlowgladServerSessionParams =
  | SupabaseFlowgladServerSessionParams
  | NextjsAuthFlowgladServerSessionParams
  | ClerkFlowgladServerSessionParams
  | BetterAuthFlowgladServerSessionParams
  | BaseFlowgladServerSessionParams
