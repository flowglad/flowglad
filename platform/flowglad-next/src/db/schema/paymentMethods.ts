import * as R from 'ramda'
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
  constructUniqueIndex,
  metadataSchema,
  SelectConditions,
  ommittedColumnsForInsertSchema,
  hiddenColumnsForClientSchema,
  merchantPolicy,
  enableCustomerReadPolicy,
} from '@/db/tableUtils'
import { customers } from '@/db/schema/customers'
import { PaymentMethodType } from '@/types'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { billingAddressSchema } from './organizations'
import core, { zodOptionalNullableString } from '@/utils/core'

const TABLE_NAME = 'payment_methods'

const columns = {
  ...tableBase('pm'),
  customerId: notNullStringForeignKey('customer_id', customers),
  billingDetails: jsonb('billing_details').notNull(),
  type: pgEnumColumn({
    enumName: 'PaymentMethodType',
    columnName: 'type',
    enumBase: PaymentMethodType,
  }).notNull(),
  default: boolean('default').notNull().default(false),
  paymentMethodData: jsonb('payment_method_data').notNull(),
  metadata: jsonb('metadata'),
  stripePaymentMethodId: text('stripe_payment_method_id'),
  externalId: text('external_id'),
}

export const paymentMethods = pgTable(
  TABLE_NAME,
  columns,
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.customerId]),
      constructIndex(TABLE_NAME, [table.type]),
      constructUniqueIndex(TABLE_NAME, [table.externalId]),
      enableCustomerReadPolicy('Enable read for customers', {
        using: sql`"customer_id" in (select "id" from "customers")`,
      }),
      merchantPolicy(
        'Enable read for own organizations via customer',
        {
          as: 'permissive',
          to: 'all',
          for: 'all',
          using: sql`"customerId" in (select "id" from "customers")`,
        }
      ),
      livemodePolicy(),
    ]
  }
).enableRLS()

export const paymentMethodBillingDetailsSchema = z.object({
  name: zodOptionalNullableString,
  email: zodOptionalNullableString,
  address: z.object({
    ...billingAddressSchema.shape.address.shape,
    // TODO: remove this
    address: billingAddressSchema.shape.address.nullish(),
  }),
})

const columnRefinements = {
  type: core.createSafeZodEnum(PaymentMethodType),
  billingDetails: paymentMethodBillingDetailsSchema,
  paymentMethodData: z.record(z.string(), z.unknown()),
  metadata: metadataSchema.nullable().optional(),
}

/*
 * database schema
 */
export const paymentMethodsInsertSchema = createSelectSchema(
  paymentMethods,
  columnRefinements
).omit(ommittedColumnsForInsertSchema)

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
  customerId: true,
} as const

const readOnlyColumns = {
  livemode: true,
} as const

const hiddenColumns = {
  stripePaymentMethodId: true,
  externalId: true,
  ...hiddenColumnsForClientSchema,
} as const

const nonClientEditableColumns = {
  ...readOnlyColumns,
  ...hiddenColumns,
  ...createOnlyColumns,
} as const

const clientWriteOmits = R.omit(['position'], {
  ...hiddenColumns,
  ...readOnlyColumns,
})

/*
 * client schemas
 */
export const paymentMethodClientInsertSchema =
  paymentMethodsInsertSchema
    .omit(clientWriteOmits)
    .meta({ id: 'PaymentMethodInsert' })

export const paymentMethodClientUpdateSchema =
  paymentMethodsUpdateSchema
    .omit(clientWriteOmits)
    .meta({ id: 'PaymentMethodUpdate' })

export const paymentMethodClientSelectSchema =
  paymentMethodsSelectSchema
    .omit(hiddenColumns)
    .meta({ id: 'PaymentMethodRecord' })

export const paymentMethodsPaginatedSelectSchema =
  createPaginatedSelectSchema(paymentMethodClientSelectSchema)

export const paymentMethodsPaginatedListSchema =
  createPaginatedListQuerySchema(paymentMethodClientSelectSchema)

export namespace PaymentMethod {
  export type Insert = z.infer<typeof paymentMethodsInsertSchema>
  export type Update = z.infer<typeof paymentMethodsUpdateSchema>
  export type Record = z.infer<typeof paymentMethodsSelectSchema>
  export type BillingDetails = z.infer<
    typeof paymentMethodBillingDetailsSchema
  >
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
  export type Where = SelectConditions<typeof paymentMethods>
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
