import {
  Organization,
  organizations,
  organizationsInsertSchema,
  organizationsSelectSchema,
  organizationsUpdateSchema,
} from '@/db/schema/organizations'
import {
  createUpsertFunction,
  createSelectById,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createInsertFunction,
  createUpdateFunction,
  createBulkInsertOrDoNothingFunction,
} from '@/db/tableUtils'
import { DbTransaction } from '../types'

const config: ORMMethodCreatorConfig<
  typeof organizations,
  typeof organizationsSelectSchema,
  typeof organizationsInsertSchema,
  typeof organizationsUpdateSchema
> = {
  selectSchema: organizationsSelectSchema,
  insertSchema: organizationsInsertSchema,
  updateSchema: organizationsUpdateSchema,
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
