import { buildSchemas } from '@db-core/createZodSchemas'
import { MembershipRole } from '@db-core/enums'
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
  timestampWithTimezoneColumn,
} from '@db-core/tableUtils'
import { sql } from 'drizzle-orm'
import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  text,
} from 'drizzle-orm/pg-core'
import * as R from 'ramda'
import { z } from 'zod'
import { organizations } from '@/db/schema/organizations'
import { users, usersSelectSchema } from '@/db/schema/users'

const MEMBERSHIPS_TABLE_NAME = 'memberships'

/**
 * PostgreSQL enum type for membership roles.
 * Exported so drizzle-kit can track it and generate CREATE TYPE migrations.
 */
export const membershipRoleEnum = pgEnum('MembershipRole', [
  MembershipRole.Owner,
  MembershipRole.Member,
])

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
    role: membershipRoleEnum()
      .notNull()
      .default(MembershipRole.Member),
    deactivatedAt: timestampWithTimezoneColumn('deactivated_at'),
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
          // Deactivated memberships are always filtered out.
          using: sql`"user_id" = requesting_user_id() AND "organization_id" = current_organization_id() AND (current_auth_type() = 'api_key' OR "focused" = true) AND "deactivated_at" IS NULL`,
        }
      ),
      merchantPolicy(
        'Enable update for own membership in current organization',
        {
          as: 'permissive',
          to: 'merchant',
          for: 'update',
          // Deactivated memberships cannot be updated via RLS.
          using: sql`"user_id" = requesting_user_id() AND "organization_id" = current_organization_id() AND "deactivated_at" IS NULL`,
          withCheck: sql`"user_id" = requesting_user_id() AND "organization_id" = current_organization_id()`,
        }
      ),
      // no livemode policy for memberships, because memberships are used to determine access to
      // everything else.
      // livemodePolicy(TABLE_NAME),
    ]
  }
).enableRLS()

/**
 * Zod schema for notification preferences stored in the JSONB column.
 * Contains 7 fields:
 * - testModeNotifications: Controls whether test mode emails are sent (defaults to true)
 * - 6 notification type preferences: Each controls a specific notification type (all default to true)
 */
export const notificationPreferencesSchema = z.object({
  testModeNotifications: z.boolean().default(true),
  subscriptionCreated: z.boolean().default(true),
  subscriptionAdjusted: z.boolean().default(true),
  subscriptionCanceled: z.boolean().default(true),
  subscriptionCancellationScheduled: z.boolean().default(true),
  paymentFailed: z.boolean().default(true),
  paymentSuccessful: z.boolean().default(true),
})

export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>

/**
 * Default notification preferences for new memberships.
 * Derived from the schema defaults by parsing an empty object.
 * Test mode defaults to ON, all notification types default to ON.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences =
  notificationPreferencesSchema.parse({})

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
  refine: {
    notificationPreferences: notificationPreferencesSchema
      .partial()
      .nullable()
      .optional(),
    role: z.enum([MembershipRole.Owner, MembershipRole.Member]),
  },
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
      role: true,
      deactivatedAt: true,
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
