import { jsonb, pgTable, text } from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import {
  nullableStringForeignKey,
  enhancedCreateInsertSchema,
  createUpdateSchema,
  constructIndex,
  constructUniqueIndex,
  tableBase,
  newBaseZodSelectSchemaColumns,
  livemodePolicy,
} from '@/db/tableUtils'
import { users } from './users'
import { z } from 'zod'

export const TABLE_NAME = 'Customers'

export const customers = pgTable(
  TABLE_NAME,
  {
    ...tableBase('cust'),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    billingAddress: jsonb('billing_address'),
    userId: nullableStringForeignKey('user_id', users),
    stackAuthUserId: text('stack_auth_id'),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.userId]),
      constructUniqueIndex(TABLE_NAME, [table.email, table.livemode]),
      livemodePolicy(),
    ]
  }
).enableRLS()

const billingAddressSchemaColumns = {
  name: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  address: z.object({
    line1: z.string(),
    line2: z.string().nullable(),
    city: z.string(),
    state: z.string(),
    postal_code: z.string(),
    country: z.string(),
  }),
  phone: z.string().optional(),
}

export const billingAddressSchema = z.object(
  billingAddressSchemaColumns
)

export type BillingAddress = z.infer<typeof billingAddressSchema>

const columnEnhancements = {
  ...newBaseZodSelectSchemaColumns,
  billingAddress: billingAddressSchema.nullable(),
}

export const customersSelectSchema = createSelectSchema(
  customers,
  columnEnhancements
)

export const clientSideCustomersSelectSchema = createSelectSchema(
  customers,
  columnEnhancements
)

export const customersInsertSchema = enhancedCreateInsertSchema(
  customers,
  columnEnhancements
)

export const customersUpdateSchema = createUpdateSchema(
  customers,
  columnEnhancements
)

const readOnlyColumns = {
  name: true,
  email: true,
  billingAddress: true,
  userId: true,
  livemode: true,
} as const

const customersInsertClientSchema =
  customersInsertSchema.omit(readOnlyColumns)

const customersUpdateClientSchema =
  customersUpdateSchema.omit(readOnlyColumns)

export namespace Customer {
  export type Insert = z.infer<typeof customersInsertSchema>
  export type Update = z.infer<typeof customersUpdateSchema>
  export type Record = z.infer<typeof customersSelectSchema>
  export type ClientInsert = z.infer<
    typeof customersInsertClientSchema
  >
  export type ClientUpdate = z.infer<
    typeof customersUpdateClientSchema
  >
  export type ClientRecord = z.infer<
    typeof clientSideCustomersSelectSchema
  >
}
