import type { BetterAuthPlugin } from 'better-auth'

export type InnerSession = {
  user: {
    id: string
    name?: string | null
    email?: string | null
    organizationId?: string | null
  }
}

/**
 * The session type returned by getSessionFromCtx in Better Auth.
 * Contains both session and user information.
 */
export type BetterAuthSessionResult = {
  session: {
    id: string
    userId: string
    activeOrganizationId?: string
    [key: string]: unknown
  }
  user: {
    id: string
    name?: string | null
    email?: string | null
    [key: string]: unknown
  }
}

/**
 * Error response format for Better Auth endpoints.
 * Consistent format: { error: { code, message, details? } }
 */
export type FlowgladEndpointError = {
  code: string
  message: string
  details?: unknown
}

export type FlowgladBetterAuthPluginOptions = {
  /**
   * Optional API key. If not provided, reads from FLOWGLAD_SECRET_KEY environment variable.
   */
  apiKey?: string
  /**
   * Optional base URL for Flowglad API. Defaults to https://app.flowglad.com
   */
  baseURL?: string

  /**
   * Type of customer to use. Defaults to "user".
   *
   * External ID resolution (via `getExternalId` / billing endpoints):
   * - "user": Uses `session.session.userId`
   * - "organization": Uses `session.session.activeOrganizationId` (requires org plugin + active org selected)
   *
   * Customer auto-creation hooks:
   * - For sign-up, the created user's `id` is used.
   * - For organization creation, the created organization's `id` is used.
   */
  customerType?: 'user' | 'organization'

  /**
   * Optional function to extract customer info from Better Auth session.
   * If not provided, defaults to extracting from session.user based on customerType.
   *
   * This gives you full control over:
   * - Which ID to use (user.id, org.id, custom mapping)
   * - How to get name/email (from user, org, or custom logic)
   */
  getCustomer?: (session: InnerSession) => Promise<{
    externalId: string
    name: string
    email: string
  }>

  /**
   * Optional callback invoked when Flowglad customer auto-creation fails inside
   * the Better Auth `after` hooks (sign-up / organization creation).
   *
   * If not provided, failures are logged with `console.error` and the auth
   * operation continues (best-effort).
   */
  onCustomerCreateError?: (params: {
    hook: 'afterSignUp' | 'afterOrganizationCreate'
    customerType: 'user' | 'organization'
    session: InnerSession
    error: unknown
  }) => void | Promise<void>
}

export type FlowgladBetterAuthPlugin = BetterAuthPlugin
