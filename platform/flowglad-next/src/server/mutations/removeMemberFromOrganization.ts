import { Result } from 'better-result'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { type Membership } from '@/db/schema/memberships'
import {
  selectFocusedMembershipAndOrganization,
  selectMembershipByIdIncludingDeactivated,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import type { DbTransaction } from '@/db/types'
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
} from '@/errors'
import { protectedProcedure } from '@/server/trpc'
import { MembershipRole } from '@/types'

export const removeMemberFromOrganizationSchema = z.object({
  membershipId: z.string(),
})

export type RemoveMemberFromOrganizationInput = z.infer<
  typeof removeMemberFromOrganizationSchema
>

export type RemoveMemberError =
  | AuthorizationError
  | NotFoundError
  | ConflictError

/**
 * Core logic for removing a member from an organization.
 *
 * Authorization rules:
 * 1. Owner can remove any non-owner member
 * 2. Member can remove themselves (leave org)
 * 3. Owner cannot remove themselves
 * 4. Member cannot remove other members
 * 5. Cross-org removal attempts return MembershipNotFoundError (to avoid information leakage)
 *
 * On success, the membership is deactivated (deactivatedAt is set) and unfocused
 * to prevent stale auth scope.
 */
export const innerRemoveMemberFromOrganization = async (
  input: RemoveMemberFromOrganizationInput,
  requesterMembership: Membership.Record,
  transaction: DbTransaction
): Promise<Result<Membership.Record, RemoveMemberError>> => {
  // Fetch target membership (including deactivated to give proper error messages)
  const targetMembership =
    await selectMembershipByIdIncludingDeactivated(
      input.membershipId,
      transaction
    )

  // Target doesn't exist
  if (!targetMembership) {
    return Result.err(
      new NotFoundError('Membership', input.membershipId)
    )
  }

  // Target is in a different organization - return NotFound to avoid leaking info
  if (
    targetMembership.organizationId !==
    requesterMembership.organizationId
  ) {
    return Result.err(
      new NotFoundError('Membership', input.membershipId)
    )
  }

  // Target is already deactivated
  if (targetMembership.deactivatedAt !== null) {
    return Result.err(
      new ConflictError(
        'Membership',
        `already deactivated: ${input.membershipId}`
      )
    )
  }

  // Cannot remove an owner
  if (targetMembership.role === MembershipRole.Owner) {
    return Result.err(
      new AuthorizationError('remove', 'organization owner')
    )
  }

  const isRequesterOwner =
    requesterMembership.role === MembershipRole.Owner
  const isSelfRemoval = requesterMembership.id === targetMembership.id

  // Requester is owner - allowed to remove any non-owner
  // Requester is removing themselves - allowed (leaving org)
  if (isRequesterOwner || isSelfRemoval) {
    const updatedMembership = await updateMembership(
      {
        id: targetMembership.id,
        deactivatedAt: Date.now(),
        focused: false, // Ensure stale focus cannot be reused for auth
      },
      transaction
    )
    return Result.ok(updatedMembership)
  }

  // Member trying to remove another member - not allowed
  // Return NotFoundError to avoid revealing membership exists
  return Result.err(
    new NotFoundError('Membership', input.membershipId)
  )
}

/**
 * Removes a member from an organization.
 *
 * - Owners can remove any non-owner member
 * - Members can only remove themselves (leave)
 * - Owners cannot be removed
 * - Deactivated memberships are soft-deleted and unfocused
 */
export const removeMemberFromOrganization = protectedProcedure
  .input(removeMemberFromOrganizationSchema)
  .mutation(async ({ input, ctx }) => {
    // Get the requester's membership in the focused organization
    const { requesterMembership } = await authenticatedTransaction(
      async ({ transaction, userId }) => {
        const focusedMembership =
          await selectFocusedMembershipAndOrganization(
            userId,
            transaction
          )

        if (!focusedMembership) {
          throw new Error('No focused membership found')
        }

        return { requesterMembership: focusedMembership.membership }
      },
      {
        apiKey: ctx.apiKey,
      }
    )

    // Perform the removal in an admin transaction
    // (we need admin because the target membership may not be the requester's)
    const result = await adminTransaction(async ({ transaction }) => {
      return innerRemoveMemberFromOrganization(
        input,
        requesterMembership,
        transaction
      )
    })

    if (Result.isError(result)) {
      throw result.error
    }

    return {
      success: true,
      membership: result.value,
    }
  })
