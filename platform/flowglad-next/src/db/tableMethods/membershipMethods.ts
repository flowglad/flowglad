import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type Membership,
  memberships,
  membershipsClientSelectSchema,
  membershipsInsertSchema,
  membershipsSelectSchema,
  membershipsTableRowDataSchema,
  membershipsUpdateSchema,
  type NotificationPreferences,
} from '@db-core/schema/memberships'
import {
  organizations,
  organizationsSelectSchema,
} from '@db-core/schema/organizations'
import type { User } from '@db-core/schema/users'
import { users, usersSelectSchema } from '@db-core/schema/users'
import {
  createCursorPaginatedSelectFunction,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  createUpsertFunction,
  type ORMMethodCreatorConfig,
  whereClauseFromObject,
} from '@db-core/tableUtils'
import { and, eq, isNull, sql } from 'drizzle-orm'
import * as R from 'ramda'
import { z } from 'zod'
import type { DbTransaction } from '@/db/types'
import { selectUsers } from './userMethods'

/**
 * Options for membership query functions.
 */
export interface MembershipQueryOptions {
  /**
   * If true, includes deactivated memberships in the results.
   * By default, deactivated memberships are filtered out.
   */
  includeDeactivated?: boolean
}

/**
 * Applies the active membership filter to conditions.
 * By default, filters out deactivated memberships (where deactivatedAt is not null).
 * If includeDeactivated is true, returns the original conditions unchanged.
 */
const withActiveFilter = (
  conditions: Membership.Where,
  options?: MembershipQueryOptions
): Membership.Where => {
  if (options?.includeDeactivated) {
    return conditions
  }
  return { ...conditions, deactivatedAt: null }
}

const config: ORMMethodCreatorConfig<
  typeof memberships,
  typeof membershipsSelectSchema,
  typeof membershipsInsertSchema,
  typeof membershipsUpdateSchema
> = {
  selectSchema: membershipsSelectSchema,
  insertSchema: membershipsInsertSchema,
  updateSchema: membershipsUpdateSchema,
  tableName: 'memberships',
}

export const selectMembershipById = createSelectById(
  memberships,
  config
)

export const upsertMembershipByUserIdAndorganizationId =
  createUpsertFunction(
    memberships,
    [memberships.userId, memberships.organizationId],
    config
  )

const _selectMembershipsRaw = createSelectFunction(
  memberships,
  config
)

/**
 * Select memberships with optional filtering for deactivated memberships.
 * By default, deactivated memberships are filtered out.
 *
 * @param conditions - The where conditions for the query
 * @param transaction - The database transaction
 * @param options - Optional query options (includeDeactivated)
 */
export const selectMemberships = async (
  conditions: Membership.Where,
  transaction: DbTransaction,
  options?: MembershipQueryOptions
): Promise<Membership.Record[]> => {
  return _selectMembershipsRaw(
    withActiveFilter(conditions, options),
    transaction
  )
}

export const insertMembership = createInsertFunction(
  memberships,
  config
)

/**
 * Select memberships with their organizations.
 * By default, deactivated memberships are filtered out.
 *
 * @param selectConditions - The where conditions for the query
 * @param transaction - The database transaction
 * @param options - Optional query options (includeDeactivated)
 */
export const selectMembershipAndOrganizations = async (
  selectConditions: Membership.Where,
  transaction: DbTransaction,
  options?: MembershipQueryOptions
) => {
  const conditions = withActiveFilter(selectConditions, options)
  let query = transaction
    .select({
      membership: memberships,
      organization: organizations,
    })
    .from(memberships)
    .innerJoin(
      organizations,
      eq(memberships.organizationId, organizations.id)
    )
    .$dynamic()
  if (!R.isEmpty(conditions)) {
    query = query.where(
      whereClauseFromObject(memberships, conditions)
    )
  }
  const result = await query
  return result.map(({ membership, organization }) => ({
    membership: membershipsSelectSchema.parse(membership),
    organization: organizationsSelectSchema.parse(organization),
  }))
}

/**
 * Select memberships and organizations by BetterAuth user ID.
 * By default, deactivated memberships are filtered out.
 *
 * @param betterAuthUserId - The BetterAuth user ID
 * @param transaction - The database transaction
 * @param options - Optional query options (includeDeactivated)
 */
export const selectMembershipAndOrganizationsByBetterAuthUserId =
  async (
    betterAuthUserId: string,
    transaction: DbTransaction,
    options?: MembershipQueryOptions
  ) => {
    let query = transaction
      .select({
        membership: memberships,
        organization: organizations,
        user: users,
      })
      .from(memberships)
      .innerJoin(
        organizations,
        eq(memberships.organizationId, organizations.id)
      )
      .innerJoin(users, eq(memberships.userId, users.id))
      .$dynamic()

    // Apply betterAuthId filter and deactivation filter
    if (options?.includeDeactivated) {
      query = query.where(eq(users.betterAuthId, betterAuthUserId))
    } else {
      query = query.where(
        and(
          eq(users.betterAuthId, betterAuthUserId),
          isNull(memberships.deactivatedAt)
        )
      )
    }

    const result = await query
    return result.map(({ membership, organization, user }) => ({
      membership: membershipsSelectSchema.parse(membership),
      organization: organizationsSelectSchema.parse(organization),
      user: usersSelectSchema.parse(user),
    }))
  }

/**
 * Select memberships with their users.
 * By default, deactivated memberships are filtered out.
 *
 * @param whereConditions - The where conditions for the query
 * @param transaction - The database transaction
 * @param options - Optional query options (includeDeactivated)
 */
export const selectMembershipsAndUsersByMembershipWhere = async (
  whereConditions: Membership.Where,
  transaction: DbTransaction,
  options?: MembershipQueryOptions
) => {
  const conditions = withActiveFilter(whereConditions, options)
  let query = transaction
    .select({
      membership: memberships,
      user: users,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .$dynamic()
  if (!R.isEmpty(conditions)) {
    query = query.where(
      whereClauseFromObject(memberships, conditions)
    )
  }
  const result = await query
  return result.map(({ membership, user }) => ({
    membership: membershipsSelectSchema.parse(membership),
    user: usersSelectSchema.parse(user),
  }))
}

/**
 * Select memberships with their organizations by membership conditions.
 * By default, deactivated memberships are filtered out.
 *
 * @param whereConditions - The where conditions for the query
 * @param transaction - The database transaction
 * @param options - Optional query options (includeDeactivated)
 */
export const selectMembershipsAndOrganizationsByMembershipWhere =
  async (
    whereConditions: Membership.Where,
    transaction: DbTransaction,
    options?: MembershipQueryOptions
  ) => {
    const conditions = withActiveFilter(whereConditions, options)
    let query = transaction
      .select({
        membership: memberships,
        organization: organizations,
      })
      .from(memberships)
      .innerJoin(
        organizations,
        eq(memberships.organizationId, organizations.id)
      )
      .$dynamic()
    if (!R.isEmpty(conditions)) {
      query = query.where(
        whereClauseFromObject(memberships, conditions)
      )
    }
    const result = await query
    return result.map(({ membership, organization }) => ({
      membership: membershipsSelectSchema.parse(membership),
      organization: organizationsSelectSchema.parse(organization),
    }))
  }

/**
 * Select the focused membership and organization for a user.
 * Deactivated memberships are automatically filtered out, meaning a user
 * whose focused membership was deactivated will have no focused membership returned.
 *
 * @param userId - The user ID
 * @param transaction - The database transaction
 */
export const selectFocusedMembershipAndOrganization = async (
  userId: string,
  transaction: DbTransaction
) => {
  const [focusedMembership] = await selectMembershipAndOrganizations(
    {
      userId,
      focused: true,
    },
    transaction
    // Note: deactivated memberships are filtered out by default
  )
  return focusedMembership
}

export const updateMembership = createUpdateFunction(
  memberships,
  config
)

/**
 * Select a membership by ID, including deactivated memberships.
 * This is useful for admin operations that need to retrieve a membership
 * regardless of its deactivation status (e.g., for reactivation on re-invite).
 *
 * @param id - The membership ID
 * @param transaction - The database transaction
 * @returns The membership record, or null if not found
 */
export const selectMembershipByIdIncludingDeactivated = async (
  id: string,
  transaction: DbTransaction
): Promise<Membership.Record | null> => {
  const results = await _selectMembershipsRaw({ id }, transaction)
  return results[0] ?? null
}

export const unfocusMembershipsForUser = async (
  userId: string,
  transaction: DbTransaction
) => {
  return transaction
    .update(memberships)
    .set({ focused: false })
    .where(eq(memberships.userId, userId))
}

export const selectMembershipsTableRowData =
  createCursorPaginatedSelectFunction(
    memberships,
    config,
    membershipsTableRowDataSchema,
    async (data, transaction) => {
      const users = await selectUsers(
        {
          id: data.map((membership) => membership.userId),
        },
        transaction
      )
      const usersById = new Map<string, User.Record>(
        users.map((user) => [user.id, user])
      )
      return data.map((membership) => ({
        user: usersById.get(membership.userId)!,
        membership: membership,
      }))
    }
  )

/**
 * Get the notification preferences for a membership, merging stored preferences with defaults.
 * If a preference is not set, the default value is used.
 *
 * @param membership - The membership record
 * @returns Complete notification preferences with defaults applied
 */
export const getMembershipNotificationPreferences = (
  membership: Membership.Record
): NotificationPreferences => {
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...((membership.notificationPreferences as Partial<NotificationPreferences>) ??
      {}),
  }
}
