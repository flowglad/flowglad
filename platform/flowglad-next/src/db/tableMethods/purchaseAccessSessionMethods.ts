import {
  purchaseAccessSessions,
  purchaseAccessSessionsInsertSchema,
  purchaseAccessSessionsSelectSchema,
  purchaseAccessSessionsUpdateSchema,
} from '@/db/schema/purchaseAccessSessions'
import {
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  createUpsertFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'

const config: ORMMethodCreatorConfig<
  typeof purchaseAccessSessions,
  typeof purchaseAccessSessionsSelectSchema,
  typeof purchaseAccessSessionsInsertSchema,
  typeof purchaseAccessSessionsUpdateSchema
> = {
  selectSchema: purchaseAccessSessionsSelectSchema,
  insertSchema: purchaseAccessSessionsInsertSchema,
  updateSchema: purchaseAccessSessionsUpdateSchema,
  tableName: 'purchase_access_sessions',
}

export const selectPurchaseAccessSessionById = createSelectById(
  purchaseAccessSessions,
  config
)

export const insertPurchaseAccessSession = createInsertFunction(
  purchaseAccessSessions,
  config
)

export const updatePurchaseAccessSession = createUpdateFunction(
  purchaseAccessSessions,
  config
)

export const selectPurchaseAccessSessions = createSelectFunction(
  purchaseAccessSessions,
  config
)

export const upsertPurchaseAccessSessionByToken =
  createUpsertFunction(
    purchaseAccessSessions,
    purchaseAccessSessions.token,

    config
  )
