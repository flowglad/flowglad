import { sql } from 'drizzle-orm'
import { boolean, jsonb, pgTable, text } from 'drizzle-orm/pg-core'
import * as R from 'ramda'
import { z } from 'zod'
import { buildSchemas } from '@/db/createZodSchemas'
import { organizations } from '@/db/schema/organizations'
import { users, usersSelectSchema } from '@/db/schema/users'
import {
  clientWriteOmitsConstructor,
  constructIndex,
  constructUniqueIndex,
  hiddenColumnsForClientSchema,
  merchantPolicy,
  newBaseZodSelectSchemaColumns,
  notNullStringForeignKey,
  type SelectConditions,
  tableBase,
} from '@/db/tableUtils'

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
    notificationPreferences: jsonb(
      'notification_preferences'
    ).default({}),
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
          // API keys bypass the focused check because they're scoped to a specific organization.
          // Webapp auth requires focused=true to ensure users only see their active organization.
          using: sql`"user_id" = requesting_user_id() AND "organization_id" = current_organization_id() AND (current_auth_type() = 'api_key' OR "focused" = true)`,
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

/**
 * Schema for notification preferences stored in the memberships table.
 * Controls which notifications a member receives and whether they receive test mode notifications.
 */
export const notificationPreferencesSchema = z.object({
  testModeNotifications: z.boolean().default(false),
  subscriptionCreated: z.boolean().default(true),
  subscriptionAdjusted: z.boolean().default(true),
  subscriptionCanceled: z.boolean().default(true),
  subscriptionCancellationScheduled: z.boolean().default(true),
  paymentFailed: z.boolean().default(true),
  onboardingCompleted: z.boolean().default(true),
  payoutsEnabled: z.boolean().default(true),
})

export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>

/**
 * Default notification preferences for new memberships.
 * - testModeNotifications defaults to false (opt-in for dev notifications)
 * - All notification types default to true (backwards compatible)
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences =
  {
    testModeNotifications: false,
    subscriptionCreated: true,
    subscriptionAdjusted: true,
    subscriptionCanceled: true,
    subscriptionCancellationScheduled: true,
    paymentFailed: true,
    onboardingCompleted: true,
    payoutsEnabled: true,
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
