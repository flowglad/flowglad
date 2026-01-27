import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { redis } from '@/utils/redis'
import {
  buildScopeId,
  deactivateSyncWebhook,
  deleteSyncWebhookConfig,
  getSyncWebhookConfig,
  getSyncWebhookConfigKey,
  parseScopeId,
  registerSyncWebhook,
  type SyncWebhookConfig,
  setSyncWebhookConfig,
} from './syncWebhookConfig'

describe('syncWebhookConfig', () => {
  const testScopeId = `test_org_${Date.now()}:test`

  afterEach(async () => {
    // Clean up test data
    try {
      await deleteSyncWebhookConfig(testScopeId)
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('getSyncWebhookConfigKey', () => {
    it('returns correct key format', () => {
      const key = getSyncWebhookConfigKey('org_123:live')
      expect(key).toBe('sync_webhook:org_123:live')
    })

    it('handles scope IDs with special characters', () => {
      const key = getSyncWebhookConfigKey('org-abc_123:test')
      expect(key).toBe('sync_webhook:org-abc_123:test')
    })
  })

  describe('buildScopeId', () => {
    it('returns correct scope ID for livemode true', () => {
      const scopeId = buildScopeId('org_123', true)
      expect(scopeId).toBe('org_123:live')
    })

    it('returns correct scope ID for livemode false', () => {
      const scopeId = buildScopeId('org_456', false)
      expect(scopeId).toBe('org_456:test')
    })
  })

  describe('parseScopeId', () => {
    it('parses valid live scope ID', () => {
      const result = parseScopeId('org_123:live')
      expect(result).toEqual({
        organizationId: 'org_123',
        livemode: true,
      })
    })

    it('parses valid test scope ID', () => {
      const result = parseScopeId('org_456:test')
      expect(result).toEqual({
        organizationId: 'org_456',
        livemode: false,
      })
    })

    it('returns null for invalid scope ID without colon', () => {
      const result = parseScopeId('org_123_live')
      expect(result).toBeNull()
    })

    it('returns null for scope ID with invalid mode', () => {
      const result = parseScopeId('org_123:staging')
      expect(result).toBeNull()
    })

    it('returns null for scope ID with too many colons', () => {
      const result = parseScopeId('org_123:live:extra')
      expect(result).toBeNull()
    })
  })

  describe('get/set/delete SyncWebhookConfig', () => {
    it('returns null for non-existent config', async () => {
      const config = await getSyncWebhookConfig(
        'non_existent_scope:test'
      )
      expect(config).toBeNull()
    })

    it('stores and retrieves a valid config', async () => {
      const testConfig: SyncWebhookConfig = {
        url: 'https://example.com/webhook',
        secret: 'a'.repeat(64),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        active: true,
      }

      await setSyncWebhookConfig(testScopeId, testConfig)
      const retrieved = await getSyncWebhookConfig(testScopeId)

      expect(retrieved).toEqual(testConfig)
    })

    it('deletes a config', async () => {
      const testConfig: SyncWebhookConfig = {
        url: 'https://example.com/webhook',
        secret: 'b'.repeat(64),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        active: true,
      }

      await setSyncWebhookConfig(testScopeId, testConfig)
      await deleteSyncWebhookConfig(testScopeId)
      const retrieved = await getSyncWebhookConfig(testScopeId)

      expect(retrieved).toBeNull()
    })

    it('returns null for invalid config data in Redis', async () => {
      // Directly set invalid data in Redis
      const client = redis()
      const key = getSyncWebhookConfigKey(testScopeId)
      await client.set(key, { invalid: 'data' })

      const config = await getSyncWebhookConfig(testScopeId)
      expect(config).toBeNull()
    })
  })

  describe('registerSyncWebhook', () => {
    it('creates new webhook config with generated secret', async () => {
      const { config, isNew } = await registerSyncWebhook({
        scopeId: testScopeId,
        url: 'https://example.com/webhook',
      })

      expect(isNew).toBe(true)
      expect(config.url).toBe('https://example.com/webhook')
      expect(config.secret).toHaveLength(64)
      expect(config.active).toBe(true)
      expect(/^[0-9a-f]{64}$/.test(config.secret)).toBe(true)
    })

    it('preserves existing secret when updating URL', async () => {
      // First registration
      const { config: firstConfig } = await registerSyncWebhook({
        scopeId: testScopeId,
        url: 'https://example.com/webhook-v1',
      })

      // Update URL
      const { config: updatedConfig, isNew } =
        await registerSyncWebhook({
          scopeId: testScopeId,
          url: 'https://example.com/webhook-v2',
        })

      expect(isNew).toBe(false)
      expect(updatedConfig.url).toBe('https://example.com/webhook-v2')
      expect(updatedConfig.secret).toBe(firstConfig.secret)
      expect(updatedConfig.createdAt).toBe(firstConfig.createdAt)
    })

    it('regenerates secret when regenerateSecret is true', async () => {
      // First registration
      const { config: firstConfig } = await registerSyncWebhook({
        scopeId: testScopeId,
        url: 'https://example.com/webhook',
      })

      // Regenerate secret
      const { config: updatedConfig, isNew } =
        await registerSyncWebhook({
          scopeId: testScopeId,
          url: 'https://example.com/webhook',
          regenerateSecret: true,
        })

      expect(isNew).toBe(false)
      expect(updatedConfig.secret).not.toBe(firstConfig.secret)
      expect(updatedConfig.secret).toHaveLength(64)
    })

    it('persists config to Redis', async () => {
      const { config } = await registerSyncWebhook({
        scopeId: testScopeId,
        url: 'https://example.com/webhook',
      })

      const retrieved = await getSyncWebhookConfig(testScopeId)
      expect(retrieved).toEqual(config)
    })
  })

  describe('deactivateSyncWebhook', () => {
    it('deactivates an existing webhook', async () => {
      await registerSyncWebhook({
        scopeId: testScopeId,
        url: 'https://example.com/webhook',
      })

      const result = await deactivateSyncWebhook(testScopeId)
      expect(result).toBe(true)

      const config = await getSyncWebhookConfig(testScopeId)
      expect(config?.active).toBe(false)
    })

    it('returns false for non-existent webhook', async () => {
      const result = await deactivateSyncWebhook(
        'non_existent_scope:test'
      )
      expect(result).toBe(false)
    })

    it('preserves URL and secret when deactivating', async () => {
      const { config: originalConfig } = await registerSyncWebhook({
        scopeId: testScopeId,
        url: 'https://example.com/webhook',
      })

      await deactivateSyncWebhook(testScopeId)
      const deactivatedConfig =
        await getSyncWebhookConfig(testScopeId)

      expect(deactivatedConfig?.url).toBe(originalConfig.url)
      expect(deactivatedConfig?.secret).toBe(originalConfig.secret)
    })
  })
})
