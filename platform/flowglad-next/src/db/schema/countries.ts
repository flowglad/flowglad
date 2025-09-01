import * as R from 'ramda'
import { pgTable, text } from 'drizzle-orm/pg-core'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import {
  ommittedColumnsForInsertSchema,
  newBaseZodSelectSchemaColumns,
  tableBase,
  constructUniqueIndex,
  SelectConditions,
  merchantPolicy,
  customerRole,
  enableCustomerReadPolicy,
} from '@/db/tableUtils'
import { z } from 'zod'
import { CountryCode } from '@/types'
import core from '@/utils/core'
import { sql } from 'drizzle-orm'

const TABLE_NAME = 'countries'

export const countries = pgTable(
  TABLE_NAME,
  {
    ...R.omit(['livemode'], tableBase('country')),
    name: text('name').notNull().unique(),
    code: text('code').notNull().unique(),
  },
  (table) => {
    return [
      constructUniqueIndex(TABLE_NAME, [table.name]),
      constructUniqueIndex(TABLE_NAME, [table.code]),
      merchantPolicy('Enable read', {
        as: 'permissive',
        to: 'merchant',
        for: 'select',
        using: sql`true`,
      }),
      enableCustomerReadPolicy(
        `Enable read for customers (${TABLE_NAME})`,
        {
          as: 'permissive',
          for: 'select',
          using: sql`true`,
        }
      ),
    ]
  }
)

// Common refinements for both SELECT and INSERT schemas
const commonColumnRefinements = {
  code: core.createSafeZodEnum(CountryCode),
}

// Column refinements for SELECT schemas only
const selectColumnRefinements = {
  ...newBaseZodSelectSchemaColumns,
  ...commonColumnRefinements,
}

// Column refinements for INSERT schemas (without auto-generated columns)
const insertColumnRefinements = {
  ...commonColumnRefinements,
}

export const countriesSelectSchema = createSelectSchema(
  countries,
  selectColumnRefinements
)

export const countriesInsertSchema = createInsertSchema(countries)
  .omit(ommittedColumnsForInsertSchema)
  .extend(insertColumnRefinements)

export const countriesUpdateSchema = countriesInsertSchema
  .partial()
  .extend({ id: z.string() })

export namespace Country {
  export type Insert = z.infer<typeof countriesInsertSchema>
  export type Update = z.infer<typeof countriesUpdateSchema>
  export type Record = z.infer<typeof countriesSelectSchema>
  export type Where = SelectConditions<typeof countries>
}

export const requestStripeConnectOnboardingLinkInputSchema = z.object(
  {
    CountryId: z.string(),
  }
)

export type RequestStripeConnectOnboardingLinkInput = z.infer<
  typeof requestStripeConnectOnboardingLinkInputSchema
>
