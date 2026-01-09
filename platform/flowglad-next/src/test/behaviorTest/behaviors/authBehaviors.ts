/**
 * Authentication Behaviors
 *
 * Behaviors for user authentication in behavior tests.
 */

import { adminTransaction } from '@/db/adminTransaction'
import type { User } from '@/db/schema/users'
import { insertUser } from '@/db/tableMethods/userMethods'
import core from '@/utils/core'
import { defineBehavior } from '../index'

// ============================================================================
// Result Types
// ============================================================================

export interface AuthenticateUserResult {
  user: User.Record
}

// ============================================================================
// Behaviors
// ============================================================================

/**
 * Authenticate User Behavior
 *
 * Creates a new user record. In the real app, this happens via Better Auth
 * with a database hook. For testing, we directly insert the user.
 *
 * Postconditions:
 * - User record exists with valid id and betterAuthId
 * - User has zero organization memberships
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
