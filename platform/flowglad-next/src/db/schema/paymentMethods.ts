import {
  pgTable,
  jsonb,
  pgPolicy,
  text,
  boolean,
} from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import {
  pgEnumColumn,
  constructIndex,
  notNullStringForeignKey,
  tableBase,
  livemodePolicy,
  createPaginatedSelectSchema,
  createPaginatedListQuerySchema,
} from '@/db/tableUtils'
import { customerProfiles } from '@/db/schema/customerProfiles'
import { PaymentMethodType } from '@/types'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { billingAddressSchema } from './customers'

const TABLE_NAME = 'PaymentMethods'

const columns = {
  ...tableBase('pm'),
  customerProfileId: notNullStringForeignKey(
    'customer_profile_id',
    customerProfiles
  ),
  billingDetails: jsonb('billingDetails').notNull(),
  type: pgEnumColumn({
    enumName: 'PaymentMethodType',
    columnName: 'type',
    enumBase: PaymentMethodType,
  }).notNull(),
  default: boolean('default').notNull().default(false),
  paymentMethodData: jsonb('paymentMethodData').notNull(),
  metadata: jsonb('metadata'),
  stripePaymentMethodId: text('stripePaymentMethodId'),
}

export const paymentMethods = pgTable(
  TABLE_NAME,
  columns,
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.customerProfileId]),
      constructIndex(TABLE_NAME, [table.type]),
      pgPolicy(
        'Enable read for own organizations via customer profiles',
        {
          as: 'permissive',
          to: 'authenticated',
          for: 'all',
          using: sql`"customerProfileId" in (select "id" from "CustomerProfiles")`,
        }
      ),
      livemodePolicy(),
    ]
  }
).enableRLS()

const columnRefinements = {
  type: z.nativeEnum(PaymentMethodType),
  billingDetails: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    address: z.object({
      name: z.string().nullable(),
      address: billingAddressSchema.shape.address
        .extend({
          country: z.string().nullable(),
          line1: z.string().nullable(),
          city: z.string().nullable(),
          state: z.string().nullable(),
          postal_code: z.string().nullable(),
        })
        .nullable(),
    }),
  }),
  paymentMethodData: z.record(z.unknown()),
  metadata: z.record(z.unknown()).nullable(),
}

/*
 * database schema
 */
export const paymentMethodsInsertSchema = createSelectSchema(
  paymentMethods,
  columnRefinements
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})

export const paymentMethodsSelectSchema =
  createSelectSchema(paymentMethods).extend(columnRefinements)

export const paymentMethodsUpdateSchema = createSelectSchema(
  paymentMethods,
  columnRefinements
)
  .partial()
  .extend({
    id: z.string(),
  })

const createOnlyColumns = {
  customerProfileId: true,
} as const

const readOnlyColumns = {
  livemode: true,
} as const

const hiddenColumns = {
  stripePaymentMethodId: true,
} as const

const nonClientEditableColumns = {
  ...readOnlyColumns,
  ...hiddenColumns,
  ...createOnlyColumns,
} as const

/*
 * client schemas
 */
export const paymentMethodClientInsertSchema =
  paymentMethodsInsertSchema.omit(nonClientEditableColumns)

export const paymentMethodClientUpdateSchema =
  paymentMethodsUpdateSchema.omit(nonClientEditableColumns)

export const paymentMethodClientSelectSchema =
  paymentMethodsSelectSchema.omit(hiddenColumns)

export const paymentMethodsPaginatedSelectSchema =
  createPaginatedSelectSchema(paymentMethodClientSelectSchema)

export const paymentMethodsPaginatedListSchema =
  createPaginatedListQuerySchema(paymentMethodClientSelectSchema)

export namespace PaymentMethod {
  export type Insert = z.infer<typeof paymentMethodsInsertSchema>
  export type Update = z.infer<typeof paymentMethodsUpdateSchema>
  export type Record = z.infer<typeof paymentMethodsSelectSchema>
  export type ClientInsert = z.infer<
    typeof paymentMethodClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof paymentMethodClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof paymentMethodClientSelectSchema
  >
  export type PaginatedList = z.infer<
    typeof paymentMethodsPaginatedListSchema
  >
  export type PaginatedSelect = z.infer<
    typeof paymentMethodsPaginatedSelectSchema
  >
}

export const createPaymentMethodSchema = z.object({
  paymentMethod: paymentMethodClientInsertSchema,
})

export type CreatePaymentMethodInput = z.infer<
  typeof createPaymentMethodSchema
>

export const editPaymentMethodSchema = z.object({
  paymentMethod: paymentMethodClientUpdateSchema,
  id: z.string(),
})

export type EditPaymentMethodInput = z.infer<
  typeof editPaymentMethodSchema
>
