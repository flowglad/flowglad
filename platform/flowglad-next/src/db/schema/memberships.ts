import * as R from 'ramda'
import { boolean, pgTable, text } from 'drizzle-orm/pg-core'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import {
  notNullStringForeignKey,
  ommittedColumnsForInsertSchema,
  constructIndex,
  constructUniqueIndex,
  tableBase,
  newBaseZodSelectSchemaColumns,
  SelectConditions,
  hiddenColumnsForClientSchema,
  merchantPolicy,
  clientWriteOmitsConstructor,
} from '@/db/tableUtils'
import { users, usersSelectSchema } from '@/db/schema/users'
import { organizations } from '@/db/schema/organizations'
import { z } from 'zod'
import { sql } from 'drizzle-orm'

const MEMBERSHIPS_TABLE_NAME = 'memberships'

export const memberships = pgTable(
  MEMBERSHIPS_TABLE_NAME,
  {
    ...tableBase('memb'),
    userId: text('user_id')
      .references(() => users.id)
      .notNull(),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    focused: boolean('focused').notNull().default(false),
  },
  (table) => {
    return [
      constructIndex(MEMBERSHIPS_TABLE_NAME, [table.userId]),
      constructIndex(MEMBERSHIPS_TABLE_NAME, [table.organizationId]),
      // Composite index for the common query pattern (userId, focused)
      constructIndex(MEMBERSHIPS_TABLE_NAME, [
        table.userId,
        table.focused,
      ]),
      constructUniqueIndex(MEMBERSHIPS_TABLE_NAME, [
        table.userId,
        table.organizationId,
      ]),
      merchantPolicy(
        'Enable read for own organizations where focused is true',
        {
          as: 'permissive',
          to: 'merchant',
          for: 'select',
          using: sql`"user_id" = requesting_user_id() and "focused" = true and "organization_id" = current_organization_id()`,
        }
      ),
      // no livemode policy for memberships, because memberships are used to determine access to
      // everything else.
      // livemodePolicy(TABLE_NAME),
    ]
  }
).enableRLS()

// Column refinements for SELECT schemas only
const selectColumnRefinements = {
  ...newBaseZodSelectSchemaColumns,
}

// Column refinements for INSERT schemas (without auto-generated columns)
const insertColumnRefinements = {
  // No additional refinements needed for insert
}

export const membershipsSelectSchema = createSelectSchema(
  memberships,
  selectColumnRefinements
)

export const membershipsInsertSchema = createInsertSchema(memberships)
  .omit(ommittedColumnsForInsertSchema)
  .extend(insertColumnRefinements)

export const membershipsUpdateSchema = membershipsInsertSchema
  .partial()
  .extend({ id: z.string() })

const hiddenColumns = {
  ...hiddenColumnsForClientSchema,
} as const

const readOnlyColumns = {
  userId: true,
  organizationId: true,
  livemode: true,
} as const

const createOnlyColumns = {} as const

const nonClientEditableColumns = {
  ...hiddenColumns,
  ...readOnlyColumns,
  ...createOnlyColumns,
} as const

const clientWriteOmits = clientWriteOmitsConstructor({
  ...hiddenColumns,
  ...readOnlyColumns,
  ...createOnlyColumns,
})

export const membershipsClientSelectSchema = membershipsSelectSchema
  .omit(hiddenColumns)
  .meta({ id: 'MembershipsClientSelectSchema' })

export const membershipsClientUpdateSchema = membershipsUpdateSchema
  .omit(clientWriteOmits)
  .meta({ id: 'MembershipsClientUpdateSchema' })

export namespace Membership {
  export type Insert = z.infer<typeof membershipsInsertSchema>
  export type Update = z.infer<typeof membershipsUpdateSchema>
  export type Record = z.infer<typeof membershipsSelectSchema>
  export type ClientRecord = z.infer<
    typeof membershipsClientSelectSchema
  >
  export type Where = SelectConditions<typeof memberships>
}

export const inviteUserToOrganizationSchema = z.object({
  email: z.email(),
  name: z.string().optional(),
})

export type InviteUserToOrganizationInput = z.infer<
  typeof inviteUserToOrganizationSchema
>

export const membershipsTableRowDataSchema = z.object({
  user: usersSelectSchema,
  membership: membershipsClientSelectSchema,
})

export type MembershipsTableRowData = z.infer<
  typeof membershipsTableRowDataSchema
>
