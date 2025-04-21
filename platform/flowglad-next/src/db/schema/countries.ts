import * as R from 'ramda'
import { pgTable, text } from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import {
  createUpdateSchema,
  enhancedCreateInsertSchema,
  newBaseZodSelectSchemaColumns,
  tableBase,
  constructUniqueIndex,
  SelectConditions,
} from '@/db/tableUtils'
import { z } from 'zod'
import { CountryCode } from '@/types'
import core from '@/utils/core'

const COUNTRIES_TABLE_NAME = 'countries'

export const countries = pgTable(
  COUNTRIES_TABLE_NAME,
  {
    ...R.omit(['livemode'], tableBase('country')),
    name: text('name').notNull().unique(),
    code: text('code').notNull().unique(),
  },
  (table) => {
    return [
      constructUniqueIndex(COUNTRIES_TABLE_NAME, [table.name]),
      constructUniqueIndex(COUNTRIES_TABLE_NAME, [table.code]),
    ]
  }
)

const columnRefinements = {
  ...newBaseZodSelectSchemaColumns,
  code: core.createSafeZodEnum(CountryCode),
}

export const countriesSelectSchema = createSelectSchema(
  countries,
  columnRefinements
)

export const countriesInsertSchema = enhancedCreateInsertSchema(
  countries,
  columnRefinements
)

export const countriesUpdateSchema = createUpdateSchema(
  countries,
  columnRefinements
)

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
