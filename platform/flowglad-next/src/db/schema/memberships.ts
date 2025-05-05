import * as R from 'ramda'
import { boolean, pgPolicy, pgTable, text } from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import {
  notNullStringForeignKey,
  enhancedCreateInsertSchema,
  constructIndex,
  constructUniqueIndex,
  tableBase,
  newBaseZodSelectSchemaColumns,
  createUpdateSchema,
  SelectConditions,
  hiddenColumnsForClientSchema,
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
      constructUniqueIndex(MEMBERSHIPS_TABLE_NAME, [
        table.userId,
        table.organizationId,
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

const clientWriteOmits = R.omit(['position'], {
  ...hiddenColumns,
  ...readOnlyColumns,
  ...createOnlyColumns,
})

export const membershipsClientSelectSchema =
  membershipsSelectSchema.omit(hiddenColumns)

export const membershipsClientUpdateSchema =
  membershipsUpdateSchema.omit(clientWriteOmits)

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
  email: z.string().email(),
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
