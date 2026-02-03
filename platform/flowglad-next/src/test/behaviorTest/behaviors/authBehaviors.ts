/**
 * Authentication Behaviors
 *
 * Behaviors representing user authentication in the Flowglad platform.
 *
 * ## Product Context
 *
 * Authentication is the entry point for all user journeys. Flowglad uses
 * Better Auth for identity management, which creates user records via
 * database hooks when users sign up or log in.
 *
 * ## User Journey
 *
 * A user arrives at Flowglad (typically via a sign-up flow) and authenticates.
 * At this point they exist in the system but have no organization memberships,
 * products, or billing configuration. This is the "blank slate" state from
 * which all other behaviors build.
 */

import type { User } from '@db-core/schema/users'
import { adminTransaction } from '@/db/adminTransaction'
import { insertUser } from '@/db/tableMethods/userMethods'
import core from '@/utils/core'
import { defineBehavior } from '../index'

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of authenticating a user.
 *
 * Contains the user record which is the foundation for all subsequent
 * behaviors in a user's journey.
 */
export interface AuthenticateUserResult {
  user: User.Record
}

// ============================================================================
// Behaviors
// ============================================================================

/**
 * Authenticate User Behavior
 *
 * Represents a user completing authentication (sign-up or sign-in).
 *
 * ## Real-World Flow
 *
 * In production, Better Auth handles OAuth/email authentication and triggers
 * a database hook that creates the user record. The user record links the
 * Better Auth identity (betterAuthId) to our internal user ID.
 *
 * ## Test Simulation
 *
 * For testing, we directly insert the user record to simulate successful
 * authentication without involving the OAuth flow.
 *
 * ## Postconditions
 *
 * - User record exists with:
 *   - `id`: Internal user ID (format: `usr_*`)
 *   - `betterAuthId`: Link to Better Auth identity (format: `ba_*`)
 *   - `email`: User's email address
 *   - `name`: User's display name
 * - User has zero organization memberships (they must create or join an org)
 * - User has no billing configuration (requires organization context)
 */
export const authenticateUserBehavior = defineBehavior({
  name: 'authenticate user',
  dependencies: [],
  run: async (
    _deps,
    _prev: undefined
  ): Promise<AuthenticateUserResult> => {
    const nanoid = core.nanoid()
    const betterAuthId = `ba_${nanoid}`

    const user = await adminTransaction(async ({ transaction }) => {
      return insertUser(
        {
          id: `usr_${nanoid}`,
          email: `test+${nanoid}@flowglad.com`,
          name: `Test User ${nanoid}`,
          betterAuthId,
        },
        transaction
      )
    })

    return { user }
  },
})
