import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { setupOrg, teardownOrg } from '@/../seedDatabase'
import {
  AI_IMAGE_GENERATION_SUBSCRIPTION_TEMPLATE,
  UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE,
  USAGE_LIMIT_SUBSCRIPTION_TEMPLATE,
} from '@/constants/pricingModelTemplates'
import { adminTransaction } from '@/db/adminTransaction'
import type { Organization } from '@/db/schema/organizations'
import { setupPricingModelTransaction } from '@/utils/pricingModels/setupTransaction'

let organization: Organization.Record

beforeEach(async () => {
  const orgData = await setupOrg()
  organization = orgData.organization
})

afterEach(async () => {
  if (organization) {
    await teardownOrg({ organizationId: organization.id })
  }
})

describe('Template Integration Tests', () => {
  describe('Template Creation', () => {
    it('should successfully create all templates', async () => {
      const templates = [
        {
          template: USAGE_LIMIT_SUBSCRIPTION_TEMPLATE,
          expectedName: 'Usage-Limit Subscription',
        },
        {
          template: UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE,
          expectedName: 'Unlimited Usage Subscription',
        },
        {
          template: AI_IMAGE_GENERATION_SUBSCRIPTION_TEMPLATE,
          expectedName: 'AI Image Generation Subscription',
        },
      ]

      for (const { template, expectedName } of templates) {
        const result = await adminTransaction(async (ctx) =>
          (
            await setupPricingModelTransaction(
              {
                input: template.input,
                organizationId: organization.id,
                livemode: false,
              },
              ctx
            )
          ).unwrap()
        )

        expect(typeof result.pricingModel.id).toBe('string')
        expect(result.pricingModel.name).toBe(expectedName)
        expect(result.products.length).toBeGreaterThan(0)
      }
    })

    it('should handle custom template names', async () => {
      const customInput = {
        ...USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.input,
        name: 'My Custom Usage Model',
      }

      const result = await adminTransaction(async (ctx) =>
        (
          await setupPricingModelTransaction(
            {
              input: customInput,
              organizationId: organization.id,
              livemode: false,
            },
            ctx
          )
        ).unwrap()
      )

      expect(result.pricingModel.name).toBe('My Custom Usage Model')
    })

    it('should create template in correct environment', async () => {
      const result = await adminTransaction(async (ctx) =>
        (
          await setupPricingModelTransaction(
            {
              input: UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE.input,
              organizationId: organization.id,
              livemode: false,
            },
            ctx
          )
        ).unwrap()
      )

      expect(result.pricingModel.livemode).toBe(false)
      expect(result.products.every((p) => p.livemode === false)).toBe(
        true
      )
      expect(result.prices.every((pr) => pr.livemode === false)).toBe(
        true
      )
    })
  })
})
