import { z } from 'zod'
import { redis } from '@/utils/redis'
import { generateSigningSecret } from '@/utils/webhookSignature'

/**
 * Sync webhook configuration stored in Redis.
 * Key format: sync_webhook:{scopeId}
 */
export const syncWebhookConfigSchema = z.object({
  /** The webhook endpoint URL */
  url: z.string().url(),
  /** The signing secret (hex string) */
  secret: z.string().min(64).max(64),
  /** When the config was created */
  createdAt: z.string().datetime(),
  /** When the config was last updated */
  updatedAt: z.string().datetime(),
  /** Whether the webhook is active */
  active: z.boolean(),
})

export type SyncWebhookConfig = z.infer<
  typeof syncWebhookConfigSchema
>

/**
 * Build the Redis key for a sync webhook config.
 */
export const getSyncWebhookConfigKey = (scopeId: string): string => {
  return `sync_webhook:${scopeId}`
}

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
 * Get a sync webhook config from Redis.
 */
export const getSyncWebhookConfig = async (
  scopeId: string
): Promise<SyncWebhookConfig | null> => {
  const client = redis()
  const key = getSyncWebhookConfigKey(scopeId)
  const data = await client.get(key)

  if (!data) {
    return null
  }

  try {
    return syncWebhookConfigSchema.parse(data)
  } catch {
    return null
  }
}

/**
 * Set a sync webhook config in Redis.
 */
export const setSyncWebhookConfig = async (
  scopeId: string,
  config: SyncWebhookConfig
): Promise<void> => {
  const client = redis()
  const key = getSyncWebhookConfigKey(scopeId)
  const validated = syncWebhookConfigSchema.parse(config)
  await client.set(key, validated)
}

/**
 * Delete a sync webhook config from Redis.
 */
export const deleteSyncWebhookConfig = async (
  scopeId: string
): Promise<void> => {
  const client = redis()
  const key = getSyncWebhookConfigKey(scopeId)
  await client.del(key)
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
 * @returns The webhook config (including the signing secret)
 */
export const registerSyncWebhook = async (params: {
  scopeId: string
  url: string
  regenerateSecret?: boolean
}): Promise<{ config: SyncWebhookConfig; isNew: boolean }> => {
  const { scopeId, url, regenerateSecret = false } = params
  const now = new Date().toISOString()

  // Check for existing config
  const existing = await getSyncWebhookConfig(scopeId)

  if (existing && !regenerateSecret) {
    // Update URL only, preserve secret
    const updated: SyncWebhookConfig = {
      ...existing,
      url,
      updatedAt: now,
      active: true,
    }
    await setSyncWebhookConfig(scopeId, updated)
    return { config: updated, isNew: false }
  }

  // Create new config with fresh secret
  const config: SyncWebhookConfig = {
    url,
    secret: generateSigningSecret(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    active: true,
  }
  await setSyncWebhookConfig(scopeId, config)
  return { config, isNew: !existing }
}

/**
 * Deactivate a sync webhook without deleting it.
 */
export const deactivateSyncWebhook = async (
  scopeId: string
): Promise<boolean> => {
  const existing = await getSyncWebhookConfig(scopeId)
  if (!existing) {
    return false
  }

  const updated: SyncWebhookConfig = {
    ...existing,
    active: false,
    updatedAt: new Date().toISOString(),
  }
  await setSyncWebhookConfig(scopeId, updated)
  return true
}
