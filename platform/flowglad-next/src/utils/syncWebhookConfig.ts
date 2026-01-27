import type { SyncWebhook } from '@/db/schema/syncWebhooks'
import {
  selectActiveSyncWebhookByScope,
  selectSyncWebhookByScope,
  updateSyncWebhook,
  upsertSyncWebhook,
} from '@/db/tableMethods/syncWebhookMethods'
import type { DbTransaction } from '@/db/types'
import { generateSigningSecret } from '@/utils/webhookSignature'

/**
 * Build a scope ID from organization ID and livemode.
 * Format: {organizationId}:{livemode ? 'live' : 'test'}
 */
export const buildScopeId = (
  organizationId: string,
  livemode: boolean
): string => {
  return `${organizationId}:${livemode ? 'live' : 'test'}`
}

/**
 * Parse a scope ID into organization ID and livemode.
 */
export const parseScopeId = (
  scopeId: string
): { organizationId: string; livemode: boolean } | null => {
  const parts = scopeId.split(':')
  if (parts.length !== 2) {
    return null
  }
  const [organizationId, mode] = parts
  if (mode !== 'live' && mode !== 'test') {
    return null
  }
  return {
    organizationId,
    livemode: mode === 'live',
  }
}

/**
 * Get a sync webhook config by scope.
 */
export const getSyncWebhookConfig = async (
  organizationId: string,
  livemode: boolean,
  transaction: DbTransaction
): Promise<SyncWebhook.Record | null> => {
  return selectSyncWebhookByScope(
    organizationId,
    livemode,
    transaction
  )
}

/**
 * Get an active sync webhook config by scope.
 */
export const getActiveSyncWebhookConfig = async (
  organizationId: string,
  livemode: boolean,
  transaction: DbTransaction
): Promise<SyncWebhook.Record | null> => {
  return selectActiveSyncWebhookByScope(
    organizationId,
    livemode,
    transaction
  )
}

/**
 * Register or update a sync webhook URL for a scope.
 *
 * If a webhook already exists for this scope:
 * - The URL is updated
 * - The existing secret is preserved (unless regenerateSecret is true)
 *
 * If no webhook exists:
 * - A new signing secret is generated
 * - The config is created
 *
 * @returns The webhook record (including the signing secret) and whether it was newly created
 */
export const registerSyncWebhook = async (
  params: {
    organizationId: string
    livemode: boolean
    url: string
    regenerateSecret?: boolean
  },
  transaction: DbTransaction
): Promise<{ webhook: SyncWebhook.Record; isNew: boolean }> => {
  const {
    organizationId,
    livemode,
    url,
    regenerateSecret = false,
  } = params

  // Check for existing config
  const existing = await selectSyncWebhookByScope(
    organizationId,
    livemode,
    transaction
  )

  if (existing && !regenerateSecret) {
    // Update URL only, preserve secret
    const updated = await updateSyncWebhook(
      {
        id: existing.id,
        url,
        active: true,
      },
      transaction
    )
    return { webhook: updated, isNew: false }
  }

  // Create or update with fresh secret
  const signingSecret = generateSigningSecret()
  const webhook = await upsertSyncWebhook(
    {
      organizationId,
      livemode,
      url,
      signingSecret,
      active: true,
    },
    transaction
  )

  return { webhook, isNew: !existing }
}

/**
 * Deactivate a sync webhook without deleting it.
 */
export const deactivateSyncWebhook = async (
  organizationId: string,
  livemode: boolean,
  transaction: DbTransaction
): Promise<boolean> => {
  const existing = await selectSyncWebhookByScope(
    organizationId,
    livemode,
    transaction
  )

  if (!existing) {
    return false
  }

  await updateSyncWebhook(
    {
      id: existing.id,
      active: false,
    },
    transaction
  )

  return true
}
