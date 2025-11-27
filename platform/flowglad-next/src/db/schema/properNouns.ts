import { sql } from 'drizzle-orm'
import { index, pgTable, text } from 'drizzle-orm/pg-core'
import * as R from 'ramda'
import type { z } from 'zod'
import { buildSchemas } from '@/db/createZodSchemas'
import { organizations } from '@/db/schema/organizations'
import {
  constructIndex,
  constructUniqueIndex,
  hiddenColumnsForClientSchema,
  livemodePolicy,
  merchantPolicy,
  notNullStringForeignKey,
  type SelectConditions,
  tableBase,
} from '@/db/tableUtils'

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
      merchantPolicy(
        `Enable read for own organizations (${TABLE_NAME})`,
        {
          as: 'permissive',
          to: 'merchant',
          for: 'select',
          using: sql`"organizationId" in (select "organizationId" from "Memberships" where "UserId" = requesting_user_id())`,
        }
      ),
      livemodePolicy(TABLE_NAME),
    ]
  }
).enableRLS()

// No special column refinements: all strings
const columnRefinements = {}

export const {
  select: properNounsSelectSchema,
  insert: properNounsInsertSchema,
  update: properNounsUpdateSchema,
  client: {
    select: properNounClientSelectSchema,
    insert: properNounClientInsertSchema,
    update: properNounClientUpdateSchema,
  },
} = buildSchemas(properNouns, {
  refine: {
    ...columnRefinements,
  },
  client: {
    hiddenColumns: {
      ...hiddenColumnsForClientSchema,
    },
    readOnlyColumns: {
      organizationId: true,
      entityId: true,
      entityType: true,
      livemode: true,
    },
    createOnlyColumns: {},
  },
  entityName: 'ProperNoun',
})

export namespace ProperNoun {
  export type Insert = z.infer<typeof properNounsInsertSchema>
  export type Update = z.infer<typeof properNounsUpdateSchema>
  export type Record = z.infer<typeof properNounsSelectSchema>
  export type ClientRecord = z.infer<
    typeof properNounClientSelectSchema
  >
  export type Where = SelectConditions<typeof properNouns>
}
