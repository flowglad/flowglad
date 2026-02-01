import { beforeEach, describe, expect, it } from 'bun:test'
import { FlowgladEventType } from '@db-core/enums'
import type { Organization } from '@db-core/schema/organizations'
import { Result } from 'better-result'
import { setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { createWebhookTransaction } from './webhooks'

describe('createWebhookTransaction', () => {
  let organization: Organization.Record
  let livePricingModelId: string
  let testmodePricingModelId: string

  beforeEach(async () => {
    const result = await setupOrg()
    organization = result.organization
    livePricingModelId = result.pricingModel.id
    testmodePricingModelId = result.testmodePricingModel.id
  })

  describe('pricingModelId validation', () => {
    it('creates webhook when pricingModelId belongs to the same organization and matches livemode', async () => {
      const result = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await createWebhookTransaction({
              webhook: {
                name: 'Test Webhook',
                url: 'https://example.com/webhook',
                filterTypes: [FlowgladEventType.SubscriptionCreated],
                active: true,
                pricingModelId: livePricingModelId,
              },
              organization,
              livemode: true,
              transaction,
            })
          )
        })
      ).unwrap()

      expect(result.webhook.id).toStartWith('webhook_')
      expect(result.webhook.name).toBe('Test Webhook')
      expect(result.webhook.url).toBe('https://example.com/webhook')
      expect(result.webhook.pricingModelId).toBe(livePricingModelId)
      expect(result.webhook.organizationId).toBe(organization.id)
      expect(result.webhook.livemode).toBe(true)
      expect(result.secret).toStartWith('whsec_')
    })

    it('creates webhook with testmode pricingModelId when webhook is testmode', async () => {
      const result = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await createWebhookTransaction({
              webhook: {
                name: 'Testmode Webhook',
                url: 'https://example.com/webhook-testmode',
                filterTypes: [FlowgladEventType.PaymentSucceeded],
                active: true,
                pricingModelId: testmodePricingModelId,
              },
              organization,
              livemode: false,
              transaction,
            })
          )
        })
      ).unwrap()

      expect(result.webhook.id).toStartWith('webhook_')
      expect(result.webhook.pricingModelId).toBe(
        testmodePricingModelId
      )
      expect(result.webhook.livemode).toBe(false)
      expect(result.secret).toStartWith('whsec_')
    })

    it('rejects webhook creation when pricingModelId belongs to a different organization', async () => {
      // Set up a second organization with its own pricing model
      const otherOrgSetup = await setupOrg()
      const otherOrgPricingModelId = otherOrgSetup.pricingModel.id

      await expect(
        adminTransaction(async ({ transaction }) => {
          await createWebhookTransaction({
            webhook: {
              name: 'Should Not Create',
              url: 'https://example.com/should-fail',
              filterTypes: [],
              active: true,
              pricingModelId: otherOrgPricingModelId,
            },
            organization, // Original organization
            livemode: true,
            transaction,
          })
        })
      ).rejects.toThrow(
        'Invalid pricing model for this organization and mode'
      )
    })

    it('rejects webhook creation when pricingModelId has different livemode than the webhook', async () => {
      await expect(
        adminTransaction(async ({ transaction }) => {
          await createWebhookTransaction({
            webhook: {
              name: 'Should Not Create',
              url: 'https://example.com/should-fail',
              filterTypes: [],
              active: true,
              pricingModelId: testmodePricingModelId, // testmode pricing model
            },
            organization,
            livemode: true, // but livemode webhook
            transaction,
          })
        })
      ).rejects.toThrow(
        'Invalid pricing model for this organization and mode'
      )
    })

    it('rejects webhook creation when livemode pricingModelId is used with testmode webhook', async () => {
      await expect(
        adminTransaction(async ({ transaction }) => {
          await createWebhookTransaction({
            webhook: {
              name: 'Should Not Create',
              url: 'https://example.com/should-fail',
              filterTypes: [],
              active: true,
              pricingModelId: livePricingModelId, // livemode pricing model
            },
            organization,
            livemode: false, // but testmode webhook
            transaction,
          })
        })
      ).rejects.toThrow(
        'Invalid pricing model for this organization and mode'
      )
    })
  })

  describe('webhook filterTypes', () => {
    it('creates webhook with multiple event filter types', async () => {
      const filterTypes = [
        FlowgladEventType.SubscriptionCreated,
        FlowgladEventType.SubscriptionUpdated,
        FlowgladEventType.PaymentSucceeded,
        FlowgladEventType.PaymentFailed,
      ]

      const result = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await createWebhookTransaction({
              webhook: {
                name: 'Multi-Event Webhook',
                url: 'https://example.com/multi-events',
                filterTypes,
                active: true,
                pricingModelId: livePricingModelId,
              },
              organization,
              livemode: true,
              transaction,
            })
          )
        })
      ).unwrap()

      expect(result.webhook.filterTypes).toEqual(filterTypes)
      expect(result.webhook.filterTypes).toHaveLength(4)
    })

    it('creates webhook with empty filter types array (subscribes to all events)', async () => {
      const result = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await createWebhookTransaction({
              webhook: {
                name: 'All Events Webhook',
                url: 'https://example.com/all-events',
                filterTypes: [],
                active: true,
                pricingModelId: livePricingModelId,
              },
              organization,
              livemode: true,
              transaction,
            })
          )
        })
      ).unwrap()

      expect(result.webhook.filterTypes).toEqual([])
    })
  })

  describe('multiple pricing models in same organization', () => {
    it('allows creating webhooks for different pricing models in the same organization', async () => {
      // Note: There's a unique constraint that only allows one livemode=true pricing model per org
      // So we test with the existing livemode and testmode pricing models from setupOrg
      const result = (
        await adminTransaction(async ({ transaction }) => {
          // Create webhook for livemode pricing model
          const result1 = await createWebhookTransaction({
            webhook: {
              name: 'Webhook for Livemode PM',
              url: 'https://example.com/pm1',
              filterTypes: [FlowgladEventType.SubscriptionCreated],
              active: true,
              pricingModelId: livePricingModelId,
            },
            organization,
            livemode: true,
            transaction,
          })

          // Create webhook for testmode pricing model
          const result2 = await createWebhookTransaction({
            webhook: {
              name: 'Webhook for Testmode PM',
              url: 'https://example.com/pm2',
              filterTypes: [FlowgladEventType.PaymentSucceeded],
              active: true,
              pricingModelId: testmodePricingModelId,
            },
            organization,
            livemode: false,
            transaction,
          })

          return Result.ok(
            await {
              webhook1: result1.webhook,
              webhook2: result2.webhook,
            }
          )
        })
      ).unwrap()

      expect(result.webhook1.pricingModelId).toBe(livePricingModelId)
      expect(result.webhook2.pricingModelId).toBe(
        testmodePricingModelId
      )
      expect(result.webhook1.pricingModelId).not.toBe(
        result.webhook2.pricingModelId
      )
    })
  })
})
