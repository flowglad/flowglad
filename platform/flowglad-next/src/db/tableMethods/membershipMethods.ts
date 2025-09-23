import * as R from 'ramda'
import {
  Membership,
  memberships,
  membershipsInsertSchema,
  membershipsSelectSchema,
  membershipsTableRowDataSchema,
  membershipsUpdateSchema,
} from '@/db/schema/memberships'
import {
  createUpsertFunction,
  createSelectById,
  createSelectFunction,
  createInsertFunction,
  ORMMethodCreatorConfig,
  createUpdateFunction,
  createCursorPaginatedSelectFunction,
  whereClauseFromObject,
} from '@/db/tableUtils'
import { eq } from 'drizzle-orm'
import {
  organizations,
  organizationsSelectSchema,
} from '../schema/organizations'
import { DbTransaction } from '@/db/types'
import { users, usersSelectSchema } from '../schema/users'
import { selectUsers } from './userMethods'
import { User } from '@/db/schema/users'

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

export const selectMemberships = createSelectFunction(
  memberships,
  config
)

export const insertMembership = createInsertFunction(
  memberships,
  config
)

export const selectMembershipAndOrganizations = async (
  selectConditions: Membership.Where,
  transaction: DbTransaction
) => {
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
  if (!R.isEmpty(selectConditions)) {
    query = query.where(
      whereClauseFromObject(memberships, selectConditions)
    )
  }
  const result = await query
  return result.map(({ membership, organization }) => ({
    membership: membershipsSelectSchema.parse(membership),
    organization: organizationsSelectSchema.parse(organization),
  }))
}

export const selectMembershipAndOrganizationsByBetterAuthUserId =
  async (betterAuthUserId: string, transaction: DbTransaction) => {
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
      .where(eq(users.betterAuthId, betterAuthUserId))

    const result = await query
    return result.map(({ membership, organization, user }) => ({
      membership: membershipsSelectSchema.parse(membership),
      organization: organizationsSelectSchema.parse(organization),
      user: usersSelectSchema.parse(user),
    }))
  }

export const selectMembershipsAndUsersByMembershipWhere = async (
  whereConditions: Membership.Where,
  transaction: DbTransaction
) => {
  let query = transaction
    .select({
      membership: memberships,
      user: users,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .$dynamic()
  if (!R.isEmpty(whereConditions)) {
    query = query.where(
      whereClauseFromObject(memberships, whereConditions)
    )
  }
  const result = await query
  return result.map(({ membership, user }) => ({
    membership: membershipsSelectSchema.parse(membership),
    user: usersSelectSchema.parse(user),
  }))
}

export const selectMembershipsAndOrganizationsByMembershipWhere =
  async (
    whereConditions: Partial<Membership.Record>,
    transaction: DbTransaction
  ) => {
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
    if (!R.isEmpty(whereConditions)) {
      query = query.where(
        whereClauseFromObject(memberships, whereConditions)
      )
    }
    const result = await query
    return result.map(({ membership, organization }) => ({
      membership: membershipsSelectSchema.parse(membership),
      organization: organizationsSelectSchema.parse(organization),
    }))
  }

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
  )
  return focusedMembership
}

export const updateMembership = createUpdateFunction(
  memberships,
  config
)

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
