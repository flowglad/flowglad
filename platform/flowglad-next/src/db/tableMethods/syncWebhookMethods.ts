import { and, eq } from 'drizzle-orm'
import {
  type SyncWebhook,
  syncWebhooks,
  syncWebhooksInsertSchema,
  syncWebhooksSelectSchema,
  syncWebhooksUpdateSchema,
} from '@/db/schema/syncWebhooks'
import {
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import type { DbTransaction } from '../types'

const config: ORMMethodCreatorConfig<
  typeof syncWebhooks,
  typeof syncWebhooksSelectSchema,
  typeof syncWebhooksInsertSchema,
  typeof syncWebhooksUpdateSchema
> = {
  tableName: 'syncWebhooks',
  selectSchema: syncWebhooksSelectSchema,
  insertSchema: syncWebhooksInsertSchema,
  updateSchema: syncWebhooksUpdateSchema,
}

export const selectSyncWebhookById = createSelectById(
  syncWebhooks,
  config
)

export const insertSyncWebhook = createInsertFunction(
  syncWebhooks,
  config
)

export const updateSyncWebhook = createUpdateFunction(
  syncWebhooks,
  config
)

export const selectSyncWebhooks = createSelectFunction(
  syncWebhooks,
  config
)

/**
 * Select a sync webhook by organization ID and livemode.
 * Since there's a unique constraint on (organizationId, livemode),
 * this returns at most one record.
 */
export const selectSyncWebhookByScope = async (
  organizationId: string,
  livemode: boolean,
  transaction: DbTransaction
): Promise<SyncWebhook.Record | null> => {
  const results = await transaction
    .select()
    .from(syncWebhooks)
    .where(
      and(
        eq(syncWebhooks.organizationId, organizationId),
        eq(syncWebhooks.livemode, livemode)
      )
    )

  if (results.length === 0) {
    return null
  }

  return syncWebhooksSelectSchema.parse(results[0])
}

/**
 * Upsert a sync webhook by organization ID and livemode.
 * Creates a new record or updates the existing one.
 */
export const upsertSyncWebhook = async (
  params: {
    organizationId: string
    livemode: boolean
    url: string
    signingSecret: string
    active?: boolean
  },
  transaction: DbTransaction
): Promise<SyncWebhook.Record> => {
  const {
    organizationId,
    livemode,
    url,
    signingSecret,
    active = true,
  } = params

  const existing = await selectSyncWebhookByScope(
    organizationId,
    livemode,
    transaction
  )

  if (existing) {
    return updateSyncWebhook(
      {
        id: existing.id,
        url,
        signingSecret,
        active,
      },
      transaction
    )
  }

  return insertSyncWebhook(
    {
      organizationId,
      livemode,
      url,
      signingSecret,
      active,
    },
    transaction
  )
}

/**
 * Get an active sync webhook for a scope.
 * Returns null if no active webhook exists.
 */
export const selectActiveSyncWebhookByScope = async (
  organizationId: string,
  livemode: boolean,
  transaction: DbTransaction
): Promise<SyncWebhook.Record | null> => {
  const results = await transaction
    .select()
    .from(syncWebhooks)
    .where(
      and(
        eq(syncWebhooks.organizationId, organizationId),
        eq(syncWebhooks.livemode, livemode),
        eq(syncWebhooks.active, true)
      )
    )

  if (results.length === 0) {
    return null
  }

  return syncWebhooksSelectSchema.parse(results[0])
}
