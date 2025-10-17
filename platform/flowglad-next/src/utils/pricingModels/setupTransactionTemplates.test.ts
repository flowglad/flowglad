import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupOrg, teardownOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { setupPricingModelTransaction } from '@/utils/pricingModels/setupTransaction'
import type { Organization } from '@/db/schema/organizations'
import {
  USAGE_LIMIT_SUBSCRIPTION_TEMPLATE,
  UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE,
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
  it('should successfully create usage-limit subscription template', async () => {
    const result = await adminTransaction(async ({ transaction }) =>
      setupPricingModelTransaction(
        {
          input: USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.input,
          organizationId: organization.id,
          livemode: false,
        },
        transaction
      )
    )

    // Verify pricing model created
    expect(result.pricingModel.id).toBeDefined()
    expect(result.pricingModel.name).toBe('Usage-Limit Subscription')

    // Verify products created (4 from template + 1 auto-generated default)
    expect(result.products).toHaveLength(5)
    const productSlugs = result.products.map((p) => p.slug)
    expect(productSlugs).toContain('hobby')
    expect(productSlugs).toContain('pro')
    expect(productSlugs).toContain('pro-plus')
    expect(productSlugs).toContain('ultra')
    expect(productSlugs).toContain('free') // Auto-generated

    // Verify usage meters created
    expect(result.usageMeters).toHaveLength(3)
    const meterSlugs = result.usageMeters.map((m) => m.slug)
    expect(meterSlugs).toContain('api-requests')
    expect(meterSlugs).toContain('ai-completions')
    expect(meterSlugs).toContain('storage-gb')

    // Verify prices created correctly
    const proProduct = result.products.find((p) => p.slug === 'pro')
    expect(proProduct).toBeDefined()
    const proPrices = result.prices.filter(
      (pr) => pr.productId === proProduct!.id
    )
    expect(proPrices).toHaveLength(2) // Monthly + Yearly
    expect(proPrices.some((p) => p.unitPrice === 2000)).toBe(true)
    expect(proPrices.some((p) => p.unitPrice === 19200)).toBe(true)
  })

  it('should successfully create unlimited usage subscription template', async () => {
    const result = await adminTransaction(async ({ transaction }) =>
      setupPricingModelTransaction(
        {
          input: UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE.input,
          organizationId: organization.id,
          livemode: false,
        },
        transaction
      )
    )

    // Verify pricing model created
    expect(result.pricingModel.id).toBeDefined()
    expect(result.pricingModel.name).toBe(
      'Unlimited Usage Subscription'
    )

    // Verify products created (4 from template + 1 auto-generated default)
    expect(result.products).toHaveLength(5)
    const productSlugs = result.products.map((p) => p.slug)
    expect(productSlugs).toContain('free-unlimited')
    expect(productSlugs).toContain('plus')
    expect(productSlugs).toContain('team')
    expect(productSlugs).toContain('enterprise')

    // Verify no usage meters (unlimited model)
    expect(result.usageMeters).toHaveLength(0)

    // Verify features are toggle-only
    expect(result.features.every((f) => f.type === 'toggle')).toBe(
      true
    )
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
