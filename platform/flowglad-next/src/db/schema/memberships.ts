import * as R from 'ramda'
import { boolean, pgTable, text } from 'drizzle-orm/pg-core'
import { buildSchemas } from '@/db/createZodSchemas'
import {
  notNullStringForeignKey,
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

// Build server and client schemas using the shared builder
export const {
  select: membershipsSelectSchema,
  insert: membershipsInsertSchema,
  update: membershipsUpdateSchema,
  client: {
    select: membershipsClientSelectSchema,
    update: membershipsClientUpdateSchema,
  },
} = buildSchemas(memberships, {
  selectRefine: {
    ...newBaseZodSelectSchemaColumns,
  },
  client: {
    hiddenColumns: {
      ...hiddenColumnsForClientSchema,
    },
    readOnlyColumns: {
      userId: true,
      organizationId: true,
      livemode: true,
    },
    createOnlyColumns: {},
  },
  entityName: 'Memberships',
})

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
