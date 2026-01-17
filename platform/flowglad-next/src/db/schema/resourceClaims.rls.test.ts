import { beforeEach, describe, expect, it } from 'bun:test'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupProductFeature,
  setupResourceFeature,
  setupResourceSubscriptionItemFeature,
  setupSubscription,
  setupSubscriptionItem,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import type { ApiKey } from '@/db/schema/apiKeys'
import type { Organization } from '@/db/schema/organizations'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { ResourceClaim } from '@/db/schema/resourceClaims'
import type { Resource } from '@/db/schema/resources'
import type { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import type { Subscription } from '@/db/schema/subscriptions'
import {
  insertResourceClaim,
  selectResourceClaims,
} from '@/db/tableMethods/resourceClaimMethods'
import { insertResource } from '@/db/tableMethods/resourceMethods'
import { IntervalUnit, PriceType } from '@/types'

/**
 * These tests verify that the merchant role has proper permissions to insert
 * resource claims. The `position` column uses a bigserial sequence,
 * and the merchant role needs USAGE and UPDATE permissions on these sequences.
 *
 * If these tests fail with "permission denied for sequence resource_claims_position_seq",
 * it means the database migration to grant sequence permissions has not been applied.
 *
 * Fix: Run the migration that grants:
 *   GRANT USAGE, UPDATE ON SEQUENCE public.resource_claims_position_seq TO merchant;
 */
describe('resource_claims RLS - merchant role sequence permissions', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let apiKey: ApiKey.Record
  let resource: Resource.Record
  let subscription: Subscription.Record
  let subscriptionItemFeature: SubscriptionItemFeature.Record

  beforeEach(async () => {
    // Set up organization with pricing model
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    // Set up API key for authenticated transactions
    const userApiKey = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
    apiKey = userApiKey.apiKey

    // Create a resource using admin transaction (bypasses RLS for setup)
    resource = await adminTransaction(async ({ transaction }) => {
      return insertResource(
        {
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          slug: 'test-seats',
          name: 'Test Seats',
          livemode: true,
          active: true,
        },
        transaction
      )
    })

    // Set up customer, payment method, product, price, subscription chain
    const customer = await setupCustomer({
      organizationId: organization.id,
      livemode: true,
      pricingModelId: pricingModel.id,
    })

    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      livemode: true,
    })

    const product = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Test Product',
      livemode: true,
    })

    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: true,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      interval: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
    })

    const subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Test Subscription Item',
      quantity: 1,
      unitPrice: price.unitPrice,
      priceId: price.id,
    })

    // Create a feature for the resource
    const feature = await setupResourceFeature({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Seats Feature',
      resourceId: resource.id,
      livemode: true,
    })

    const productFeature = await setupProductFeature({
      productId: product.id,
      featureId: feature.id,
      organizationId: organization.id,
      livemode: true,
    })

    // Create subscription item feature using the helper
    subscriptionItemFeature =
      await setupResourceSubscriptionItemFeature({
        subscriptionItemId: subscriptionItem.id,
        featureId: feature.id,
        resourceId: resource.id,
        pricingModelId: pricingModel.id,
        productFeatureId: productFeature.id,
        livemode: true,
      })
  })

  describe('insertResourceClaim via authenticatedTransaction (merchant role)', () => {
    it('inserts a resource claim when merchant role has sequence permissions', async () => {
      const claimInsert: ResourceClaim.Insert = {
        organizationId: organization.id,
        subscriptionItemFeatureId: subscriptionItemFeature.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        livemode: true,
        externalId: 'test-claim-1',
      }

      const inserted = await authenticatedTransaction(
        async ({ transaction }) => {
          return insertResourceClaim(claimInsert, transaction)
        },
        { apiKey: apiKey.token }
      )

      expect(inserted.id).toMatch(/^res_claim_/)
      expect(inserted.resourceId).toBe(resource.id)
      expect(inserted.subscriptionId).toBe(subscription.id)
      expect(inserted.subscriptionItemFeatureId).toBe(
        subscriptionItemFeature.id
      )
      expect(inserted.organizationId).toBe(organization.id)
      expect(inserted.pricingModelId).toBe(pricingModel.id)
      expect(inserted.externalId).toBe('test-claim-1')
      expect(inserted.releasedAt).toBeNull()
      // The position column should be auto-populated by the sequence
      expect(typeof inserted.position).toBe('number')
    })

    it('selects resource claims via authenticatedTransaction after insertion', async () => {
      // Insert a claim
      const inserted = await authenticatedTransaction(
        async ({ transaction }) => {
          return insertResourceClaim(
            {
              organizationId: organization.id,
              subscriptionItemFeatureId: subscriptionItemFeature.id,
              resourceId: resource.id,
              subscriptionId: subscription.id,
              pricingModelId: pricingModel.id,
              livemode: true,
              externalId: 'select-test-claim',
            },
            transaction
          )
        },
        { apiKey: apiKey.token }
      )

      // Select it back
      const claims = await authenticatedTransaction(
        async ({ transaction }) => {
          return selectResourceClaims(
            { subscriptionId: subscription.id },
            transaction
          )
        },
        { apiKey: apiKey.token }
      )

      expect(claims.length).toBeGreaterThanOrEqual(1)
      const foundClaim = claims.find((c) => c.id === inserted.id)
      expect(foundClaim?.id).toBe(inserted.id)
      expect(foundClaim?.externalId).toBe('select-test-claim')
    })

    it('inserts multiple resource claims for the same subscription', async () => {
      // Insert multiple claims
      await authenticatedTransaction(
        async ({ transaction }) => {
          await insertResourceClaim(
            {
              organizationId: organization.id,
              subscriptionItemFeatureId: subscriptionItemFeature.id,
              resourceId: resource.id,
              subscriptionId: subscription.id,
              pricingModelId: pricingModel.id,
              livemode: true,
              externalId: 'claim-1',
            },
            transaction
          )
          await insertResourceClaim(
            {
              organizationId: organization.id,
              subscriptionItemFeatureId: subscriptionItemFeature.id,
              resourceId: resource.id,
              subscriptionId: subscription.id,
              pricingModelId: pricingModel.id,
              livemode: true,
              externalId: 'claim-2',
            },
            transaction
          )
        },
        { apiKey: apiKey.token }
      )

      // Select all claims for the subscription
      const claims = await authenticatedTransaction(
        async ({ transaction }) => {
          return selectResourceClaims(
            { subscriptionId: subscription.id },
            transaction
          )
        },
        { apiKey: apiKey.token }
      )

      expect(claims.length).toBeGreaterThanOrEqual(2)
      const externalIds = claims.map((c) => c.externalId)
      expect(externalIds).toContain('claim-1')
      expect(externalIds).toContain('claim-2')
    })
  })
})
