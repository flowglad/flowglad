import { CountryCode } from '@db-core/enums'
import { sql } from 'drizzle-orm'
import { pgTable, text } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import * as R from 'ramda'
import { z } from 'zod'
import {
  constructUniqueIndex,
  customerRole,
  enableCustomerReadPolicy,
  merchantPolicy,
  newBaseZodSelectSchemaColumns,
  ommittedColumnsForInsertSchema,
  type SelectConditions,
  tableBase,
} from '@/db/tableUtils'
import core from '@/utils/core'
import { countryCodeSchema } from '../commonZodSchema'
import { buildSchemas } from '../createZodSchemas'

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
  code: countryCodeSchema,
}

// Column refinements for SELECT schemas only
const selectColumnRefinements = {
  ...newBaseZodSelectSchemaColumns,
  ...commonColumnRefinements,
}

export const {
  select: countriesSelectSchema,
  insert: countriesInsertSchema,
  update: countriesUpdateSchema,
} = buildSchemas(countries, {
  refine: commonColumnRefinements,
  selectRefine: selectColumnRefinements,
  entityName: 'Country',
})

export namespace Country {
  export type Insert = z.infer<typeof countriesInsertSchema>
  export type Update = z.infer<typeof countriesUpdateSchema>
  export type Record = z.infer<typeof countriesSelectSchema>
  export type Where = SelectConditions<typeof countries>
}

export const requestStripeConnectOnboardingLinkInputSchema = z.object(
  {}
)

export type RequestStripeConnectOnboardingLinkInput = z.infer<
  typeof requestStripeConnectOnboardingLinkInputSchema
>
