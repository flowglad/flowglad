import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { adminTransaction } from '@/db/adminTransaction'
import { syncWebhooks } from '@/db/schema/syncWebhooks'
import core from '@/utils/core'
import {
  buildScopeId,
  deactivateSyncWebhook,
  getActiveSyncWebhookConfig,
  getSyncWebhookConfig,
  parseScopeId,
  registerSyncWebhook,
} from './syncWebhookConfig'

describe('syncWebhookConfig', () => {
  // Use a unique org ID per test run to avoid collisions
  const testOrgId = `test_org_${core.nanoid()}`
  const testLivemode = false

  afterEach(async () => {
    // Clean up test data
    await adminTransaction(
      async ({ transaction }) => {
        await transaction
          .delete(syncWebhooks)
          .where(eq(syncWebhooks.organizationId, testOrgId))
      },
      { livemode: testLivemode }
    )
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

  describe('getSyncWebhookConfig', () => {
    it('returns null for non-existent config', async () => {
      const config = await adminTransaction(
        async ({ transaction }) => {
          return getSyncWebhookConfig(
            'non_existent_org',
            false,
            transaction
          )
        },
        { livemode: false }
      )

      expect(config).toBeNull()
    })
  })

  describe('registerSyncWebhook', () => {
    it('creates new webhook config with generated secret', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return registerSyncWebhook(
            {
              organizationId: testOrgId,
              livemode: testLivemode,
              url: 'https://example.com/webhook',
            },
            transaction
          )
        },
        { livemode: testLivemode }
      )

      expect(result.isNew).toBe(true)
      expect(result.webhook.url).toBe('https://example.com/webhook')
      expect(result.webhook.signingSecret).toHaveLength(64)
      expect(result.webhook.active).toBe(true)
      expect(
        /^[0-9a-f]{64}$/.test(result.webhook.signingSecret)
      ).toBe(true)
    })

    it('preserves existing secret when updating URL', async () => {
      // First registration
      const firstResult = await adminTransaction(
        async ({ transaction }) => {
          return registerSyncWebhook(
            {
              organizationId: testOrgId,
              livemode: testLivemode,
              url: 'https://example.com/webhook-v1',
            },
            transaction
          )
        },
        { livemode: testLivemode }
      )

      // Update URL
      const updatedResult = await adminTransaction(
        async ({ transaction }) => {
          return registerSyncWebhook(
            {
              organizationId: testOrgId,
              livemode: testLivemode,
              url: 'https://example.com/webhook-v2',
            },
            transaction
          )
        },
        { livemode: testLivemode }
      )

      expect(updatedResult.isNew).toBe(false)
      expect(updatedResult.webhook.url).toBe(
        'https://example.com/webhook-v2'
      )
      expect(updatedResult.webhook.signingSecret).toBe(
        firstResult.webhook.signingSecret
      )
    })

    it('regenerates secret when regenerateSecret is true', async () => {
      // First registration
      const firstResult = await adminTransaction(
        async ({ transaction }) => {
          return registerSyncWebhook(
            {
              organizationId: testOrgId,
              livemode: testLivemode,
              url: 'https://example.com/webhook',
            },
            transaction
          )
        },
        { livemode: testLivemode }
      )

      // Regenerate secret
      const updatedResult = await adminTransaction(
        async ({ transaction }) => {
          return registerSyncWebhook(
            {
              organizationId: testOrgId,
              livemode: testLivemode,
              url: 'https://example.com/webhook',
              regenerateSecret: true,
            },
            transaction
          )
        },
        { livemode: testLivemode }
      )

      expect(updatedResult.isNew).toBe(false)
      expect(updatedResult.webhook.signingSecret).not.toBe(
        firstResult.webhook.signingSecret
      )
      expect(updatedResult.webhook.signingSecret).toHaveLength(64)
    })

    it('persists config to database', async () => {
      const { webhook } = await adminTransaction(
        async ({ transaction }) => {
          return registerSyncWebhook(
            {
              organizationId: testOrgId,
              livemode: testLivemode,
              url: 'https://example.com/webhook',
            },
            transaction
          )
        },
        { livemode: testLivemode }
      )

      const retrieved = await adminTransaction(
        async ({ transaction }) => {
          return getSyncWebhookConfig(
            testOrgId,
            testLivemode,
            transaction
          )
        },
        { livemode: testLivemode }
      )

      expect(retrieved?.id).toBe(webhook.id)
      expect(retrieved?.url).toBe(webhook.url)
      expect(retrieved?.signingSecret).toBe(webhook.signingSecret)
    })
  })

  describe('deactivateSyncWebhook', () => {
    it('deactivates an existing webhook', async () => {
      await adminTransaction(
        async ({ transaction }) => {
          await registerSyncWebhook(
            {
              organizationId: testOrgId,
              livemode: testLivemode,
              url: 'https://example.com/webhook',
            },
            transaction
          )
        },
        { livemode: testLivemode }
      )

      const result = await adminTransaction(
        async ({ transaction }) => {
          return deactivateSyncWebhook(
            testOrgId,
            testLivemode,
            transaction
          )
        },
        { livemode: testLivemode }
      )

      expect(result).toBe(true)

      const config = await adminTransaction(
        async ({ transaction }) => {
          return getSyncWebhookConfig(
            testOrgId,
            testLivemode,
            transaction
          )
        },
        { livemode: testLivemode }
      )

      expect(config?.active).toBe(false)
    })

    it('returns false for non-existent webhook', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return deactivateSyncWebhook(
            'non_existent_org',
            false,
            transaction
          )
        },
        { livemode: false }
      )

      expect(result).toBe(false)
    })

    it('preserves URL and secret when deactivating', async () => {
      const { webhook: originalWebhook } = await adminTransaction(
        async ({ transaction }) => {
          return registerSyncWebhook(
            {
              organizationId: testOrgId,
              livemode: testLivemode,
              url: 'https://example.com/webhook',
            },
            transaction
          )
        },
        { livemode: testLivemode }
      )

      await adminTransaction(
        async ({ transaction }) => {
          return deactivateSyncWebhook(
            testOrgId,
            testLivemode,
            transaction
          )
        },
        { livemode: testLivemode }
      )

      const deactivatedConfig = await adminTransaction(
        async ({ transaction }) => {
          return getSyncWebhookConfig(
            testOrgId,
            testLivemode,
            transaction
          )
        },
        { livemode: testLivemode }
      )

      expect(deactivatedConfig?.url).toBe(originalWebhook.url)
      expect(deactivatedConfig?.signingSecret).toBe(
        originalWebhook.signingSecret
      )
    })
  })

  describe('getActiveSyncWebhookConfig', () => {
    it('returns active webhook', async () => {
      await adminTransaction(
        async ({ transaction }) => {
          await registerSyncWebhook(
            {
              organizationId: testOrgId,
              livemode: testLivemode,
              url: 'https://example.com/webhook',
            },
            transaction
          )
        },
        { livemode: testLivemode }
      )

      const config = await adminTransaction(
        async ({ transaction }) => {
          return getActiveSyncWebhookConfig(
            testOrgId,
            testLivemode,
            transaction
          )
        },
        { livemode: testLivemode }
      )

      expect(config?.active).toBe(true)
    })

    it('returns null for deactivated webhook', async () => {
      await adminTransaction(
        async ({ transaction }) => {
          await registerSyncWebhook(
            {
              organizationId: testOrgId,
              livemode: testLivemode,
              url: 'https://example.com/webhook',
            },
            transaction
          )
          await deactivateSyncWebhook(
            testOrgId,
            testLivemode,
            transaction
          )
        },
        { livemode: testLivemode }
      )

      const config = await adminTransaction(
        async ({ transaction }) => {
          return getActiveSyncWebhookConfig(
            testOrgId,
            testLivemode,
            transaction
          )
        },
        { livemode: testLivemode }
      )

      expect(config).toBeNull()
    })
  })
})
