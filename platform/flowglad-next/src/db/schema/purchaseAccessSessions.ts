import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import type { z } from 'zod'
import { buildSchemas } from '@/db/createZodSchemas'
import {
  constructIndex,
  constructUniqueIndex,
  createSupabaseWebhookSchema,
  livemodePolicy,
  notNullStringForeignKey,
  ommittedColumnsForInsertSchema,
  pgEnumColumn,
  type SelectConditions,
  tableBase,
  timestampWithTimezoneColumn,
} from '@/db/tableUtils'
import { PurchaseAccessSessionSource } from '@/types'
import core from '@/utils/core'
import { purchases } from './purchases'

const TABLE_NAME = 'purchase_access_sessions'

export const purchaseAccessSessions = pgTable(
  TABLE_NAME,
  {
    ...tableBase('pasess'),
    purchaseId: notNullStringForeignKey('purchase_id', purchases),
    token: text('token').notNull(),
    source: pgEnumColumn({
      enumName: 'PurchaseAccessSessionSource',
      columnName: 'source',
      enumBase: PurchaseAccessSessionSource,
    }).notNull(),
    expires: timestampWithTimezoneColumn('expires')
      .notNull()
      .$defaultFn(() => Date.now() + 1000 * 60 * 60 * 24 * 7),
    granted: boolean('granted').default(false),
    metadata: jsonb('metadata'),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.purchaseId]),
      constructUniqueIndex(TABLE_NAME, [table.token]),
      livemodePolicy(TABLE_NAME),
    ]
  }
).enableRLS()

const columnEnhancers = {
  source: core.createSafeZodEnum(PurchaseAccessSessionSource),
}

export const {
  select: purchaseAccessSessionsSelectSchema,
  insert: purchaseAccessSessionsInsertSchema,
  update: purchaseAccessSessionsUpdateSchema,
  client: {
    select: purchaseAccessSessionsClientSelectSchema,
    insert: purchaseAccessSessionsClientInsertSchema,
    update: purchaseAccessSessionsClientUpdateSchema,
  },
} = buildSchemas(purchaseAccessSessions, {
  refine: {
    ...columnEnhancers,
  },
  client: {
    hiddenColumns: {},
    readOnlyColumns: {
      purchaseId: true,
      granted: true,
      expires: true,
      metadata: true,
      source: true,
      livemode: true,
      token: true,
    },
    createOnlyColumns: {},
  },
  entityName: 'PurchaseAccessSession',
})

export namespace PurchaseAccessSession {
  export type Insert = z.infer<
    typeof purchaseAccessSessionsInsertSchema
  >
  export type Update = z.infer<
    typeof purchaseAccessSessionsUpdateSchema
  >
  export type Record = z.infer<
    typeof purchaseAccessSessionsSelectSchema
  >
  export type ClientRecord = z.infer<
    typeof purchaseAccessSessionsClientSelectSchema
  >
  export type ClientInsert = z.infer<
    typeof purchaseAccessSessionsClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof purchaseAccessSessionsClientUpdateSchema
  >
  export type Where = SelectConditions<typeof purchaseAccessSessions>
}
