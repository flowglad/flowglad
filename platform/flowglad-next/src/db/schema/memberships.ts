import { boolean, pgPolicy, pgTable } from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import {
  notNullStringForeignKey,
  enhancedCreateInsertSchema,
  constructIndex,
  constructUniqueIndex,
  tableBase,
  newBaseZodSelectSchemaColumns,
  createUpdateSchema,
  livemodePolicy,
} from '@/db/tableUtils'
import { users } from '@/db/schema/users'
import { organizations } from '@/db/schema/organizations'
import { z } from 'zod'
import { sql } from 'drizzle-orm'

const MEMBERSHIPS_TABLE_NAME = 'Memberships'

export const memberships = pgTable(
  MEMBERSHIPS_TABLE_NAME,
  {
    ...tableBase('memb'),
    UserId: notNullStringForeignKey('UserId', users),
    OrganizationId: notNullStringForeignKey(
      'OrganizationId',
      organizations
    ),
    focused: boolean('focused').notNull().default(false),
  },
  (table) => {
    return [
      constructIndex(MEMBERSHIPS_TABLE_NAME, [table.UserId]),
      constructIndex(MEMBERSHIPS_TABLE_NAME, [table.OrganizationId]),
      constructUniqueIndex(MEMBERSHIPS_TABLE_NAME, [
        table.UserId,
        table.OrganizationId,
      ]),
      pgPolicy('Enable read for own organizations', {
        as: 'permissive',
        to: 'authenticated',
        for: 'select',
        using: sql`"UserId" = requesting_user_id()`,
      }),
      // no livemode policy for memberships, because memberships are used to determine access to
      // everything else.
      // livemodePolicy(),
    ]
  }
).enableRLS()

const columnRefinements = {
  ...newBaseZodSelectSchemaColumns,
}

export const membershipsSelectSchema = createSelectSchema(
  memberships,
  columnRefinements
)

export const membershipsInsertSchema = enhancedCreateInsertSchema(
  memberships,
  columnRefinements
)

export const membershipsUpdateSchema = createUpdateSchema(
  memberships,
  columnRefinements
)

const hiddenColumns = {} as const

const readOnlyColumns = {
  UserId: true,
  OrganizationId: true,
  livemode: true,
} as const

const createOnlyColumns = {} as const

const nonClientEditableColumns = {
  ...hiddenColumns,
  ...readOnlyColumns,
  ...createOnlyColumns,
} as const

export const membershipsClientSelectSchema =
  membershipsSelectSchema.omit(hiddenColumns)

export const membershipsClientUpdateSchema =
  membershipsUpdateSchema.omit(nonClientEditableColumns)

export namespace Membership {
  export type Insert = z.infer<typeof membershipsInsertSchema>
  export type Update = z.infer<typeof membershipsUpdateSchema>
  export type Record = z.infer<typeof membershipsSelectSchema>
  export type ClientRecord = z.infer<
    typeof membershipsClientSelectSchema
  >
}
