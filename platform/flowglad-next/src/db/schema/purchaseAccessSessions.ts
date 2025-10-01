import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import {
  pgEnumColumn,
  constructUniqueIndex,
  constructIndex,
  tableBase,
  notNullStringForeignKey,
  livemodePolicy,
  createSupabaseWebhookSchema,
  ommittedColumnsForInsertSchema,
  SelectConditions,
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
      .$defaultFn(
        () => new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
      ),
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

export const purchaseAccessSessionsInsertSchema = createInsertSchema(
  purchaseAccessSessions
)
  .omit(ommittedColumnsForInsertSchema)
  .extend(columnEnhancers)

export const purchaseAccessSessionsSelectSchema = createSelectSchema(
  purchaseAccessSessions
).extend(columnEnhancers)

export const purchaseAccessSessionsUpdateSchema =
  purchaseAccessSessionsInsertSchema
    .partial()
    .extend({ id: z.string() })

const readonlyColumns = {
  purchaseId: true,
  granted: true,
  expires: true,
  metadata: true,
  source: true,
  livemode: true,
  token: true,
} as const

const hiddenColumns = {} as const

const purchaseAccessSessionsClientSelectSchema =
  purchaseAccessSessionsSelectSchema.omit(hiddenColumns)

const purchaseAccessSessionsClientInsertSchema =
  purchaseAccessSessionsInsertSchema.omit({
    ...readonlyColumns,
    ...hiddenColumns,
  })

const purchaseAccessSessionsClientUpdateSchema =
  purchaseAccessSessionsUpdateSchema.omit({
    ...readonlyColumns,
    ...hiddenColumns,
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
