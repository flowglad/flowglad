import { text, pgTable, pgPolicy, index } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import {
  tableBase,
  notNullStringForeignKey,
  constructIndex,
  constructUniqueIndex,
  enhancedCreateInsertSchema,
  createUpdateSchema,
  livemodePolicy,
  SelectConditions,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { createSelectSchema } from 'drizzle-zod'
import { sql } from 'drizzle-orm'

const TABLE_NAME = 'proper_nouns'

export const properNouns = pgTable(
  TABLE_NAME,
  {
    ...tableBase('proper_noun'),
    name: text('name').notNull(),
    entityId: text('entity_id').notNull(),
    entityType: text('entity_type').notNull(),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructUniqueIndex(TABLE_NAME, [
        table.entityId,
        table.entityType,
      ]),
      constructIndex(TABLE_NAME, [
        table.entityType,
        table.entityId,
        table.organizationId,
      ]),
      constructIndex(TABLE_NAME, [table.name]),
      index('proper_noun_name_search_index').using(
        'gin',
        sql`to_tsvector('english', ${table.name})`
      ),
      constructIndex(TABLE_NAME, [table.entityId]),
      pgPolicy('Enable read for own organizations', {
        as: 'permissive',
        to: 'authenticated',
        for: 'select',
        using: sql`"organizationId" in (select "organizationId" from "Memberships" where "UserId" = requesting_user_id())`,
      }),
      livemodePolicy(),
    ]
  }
).enableRLS()

// No column refinements needed since we only have string columns
const columnRefinements = {}

/*
 * database schemas
 */
export const properNounsInsertSchema = enhancedCreateInsertSchema(
  properNouns,
  columnRefinements
)

export const properNounsSelectSchema = createSelectSchema(properNouns)

export const properNounsUpdateSchema = createUpdateSchema(properNouns)

const createOnlyColumns = {} as const

const readOnlyColumns = {
  organizationId: true,
  entityId: true,
  entityType: true,
  livemode: true,
} as const

const hiddenColumns = {} as const

/*
 * client schemas
 */
export const properNounClientInsertSchema =
  properNounsInsertSchema.omit({
    ...hiddenColumns,
    ...readOnlyColumns,
    ...createOnlyColumns,
  })

export const properNounClientUpdateSchema =
  properNounsUpdateSchema.omit({
    ...readOnlyColumns,
    ...createOnlyColumns,
    ...hiddenColumns,
  })

export const properNounClientSelectSchema =
  properNounsSelectSchema.omit(hiddenColumns)

export namespace ProperNoun {
  export type Insert = z.infer<typeof properNounsInsertSchema>
  export type Update = z.infer<typeof properNounsUpdateSchema>
  export type Record = z.infer<typeof properNounsSelectSchema>
  export type ClientRecord = z.infer<
    typeof properNounClientSelectSchema
  >
  export type Where = SelectConditions<typeof properNouns>
}
