import { asc, eq } from 'drizzle-orm'
import { memberships } from '@/db/schema/memberships'
import {
  type Organization,
  organizations,
  organizationsInsertSchema,
  organizationsSelectSchema,
  organizationsUpdateSchema,
} from '@/db/schema/organizations'
import { users, usersSelectSchema } from '@/db/schema/users'
import {
  createBulkInsertOrDoNothingFunction,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  createUpsertFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import type { DbTransaction } from '../types'

const config: ORMMethodCreatorConfig<
  typeof organizations,
  typeof organizationsSelectSchema,
  typeof organizationsInsertSchema,
  typeof organizationsUpdateSchema
> = {
  selectSchema: organizationsSelectSchema,
  insertSchema: organizationsInsertSchema,
  updateSchema: organizationsUpdateSchema,
  tableName: 'organizations',
}

export const selectOrganizationById = createSelectById(
  organizations,
  config
)

export const upsertOrganizationByName = createUpsertFunction(
  organizations,
  organizations.name,
  config
)

export const upsertOrganizationByStripeAccountId =
  createUpsertFunction(
    organizations,
    organizations.stripeAccountId,
    config
  )

export const selectOrganizations = createSelectFunction(
  organizations,
  config
)

export const insertOrganization = createInsertFunction(
  organizations,
  config
)

export const updateOrganization = createUpdateFunction(
  organizations,
  config
)

const insertOrDoNothingOrganization =
  createBulkInsertOrDoNothingFunction(organizations, config)

export const bulkInsertOrDoNothingOrganizationsByExternalId = (
  inserts: Organization.Insert[],
  transaction: DbTransaction
) => {
  return insertOrDoNothingOrganization(
    inserts,
    [organizations.externalId],
    transaction
  )
}

export const insertOrDoNothingOrganizationByExternalId = async (
  insert: Organization.Insert,
  transaction: DbTransaction
) => {
  const inserts = [insert]
  const result = await insertOrDoNothingOrganization(
    inserts,
    [organizations.externalId],
    transaction
  )
  if (!result || result.length === 0 || result[0] === null) {
    const [organization] = await selectOrganizations(
      {
        externalId: insert.externalId,
      },
      transaction
    )
    return organization
  }
  return result[0]
}

export const selectOrganizationAndFirstMemberByOrganizationId =
  async (organizationId: string, transaction: DbTransaction) => {
    const result = await transaction
      .select({
        organization: organizations,
        user: users,
      })
      .from(organizations)
      .innerJoin(
        memberships,
        eq(memberships.organizationId, organizations.id)
      )
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(organizations.id, organizationId))
      .orderBy(asc(memberships.createdAt))
      .limit(1)

    if (!result || result.length === 0) {
      return null
    }

    return {
      organization: organizationsSelectSchema.parse(
        result[0].organization
      ),
      user: usersSelectSchema.parse(result[0].user),
    }
  }
