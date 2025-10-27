import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupOrg, teardownOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { setupPricingModelTransaction } from '@/utils/pricingModels/setupTransaction'
import type { Organization } from '@/db/schema/organizations'
import {
  USAGE_LIMIT_SUBSCRIPTION_TEMPLATE,
  UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE,
  CREDITS_SUBSCRIPTION_TEMPLATE,
  AI_IMAGE_GENERATION_SUBSCRIPTION_TEMPLATE,
} from '@/constants/pricingModelTemplates'

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
          template: CREDITS_SUBSCRIPTION_TEMPLATE,
          expectedName: 'Credit rollover subscription',
        },
        {
          template: AI_IMAGE_GENERATION_SUBSCRIPTION_TEMPLATE,
          expectedName: 'AI Image Generation Subscription',
        },
      ]

      for (const { template, expectedName } of templates) {
        const result = await adminTransaction(
          async ({ transaction }) =>
            setupPricingModelTransaction(
              {
                input: template.input,
                organizationId: organization.id,
                livemode: false,
              },
              transaction
            )
        )

        expect(result.pricingModel.id).toBeDefined()
        expect(result.pricingModel.name).toBe(expectedName)
        expect(result.products.length).toBeGreaterThan(0)
      }
    })

    it('should handle custom template names', async () => {
      const customInput = {
        ...USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.input,
        name: 'My Custom Usage Model',
      }

      const result = await adminTransaction(async ({ transaction }) =>
        setupPricingModelTransaction(
          {
            input: customInput,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
      )

      expect(result.pricingModel.name).toBe('My Custom Usage Model')
    })

    it('should create template in correct environment', async () => {
      const result = await adminTransaction(async ({ transaction }) =>
        setupPricingModelTransaction(
          {
            input: UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE.input,
            organizationId: organization.id,
            livemode: true,
          },
          transaction
        )
      )

      expect(result.pricingModel.livemode).toBe(true)
      expect(result.products.every((p) => p.livemode === true)).toBe(
        true
      )
      expect(result.prices.every((pr) => pr.livemode === true)).toBe(
        true
      )
    })
  })
})
