import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  createUpsertFunction,
  ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import {
  purchaseAccessSessions,
  purchaseAccessSessionsInsertSchema,
  purchaseAccessSessionsSelectSchema,
  purchaseAccessSessionsUpdateSchema,
} from '@/db/schema/purchaseAccessSessions'

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
