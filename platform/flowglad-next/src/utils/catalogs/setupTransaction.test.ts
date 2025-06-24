import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupOrg, teardownOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupCatalogTransaction,
  externalIdFromProductData,
} from '@/utils/catalogs/setupTransaction'
import { hashData } from '@/utils/backendCore'
import type {
  SetupCatalogInput,
  SetupCatalogProductInput,
} from '@/utils/catalogs/setupSchemas'
import {
  FeatureType,
  FeatureUsageGrantFrequency,
  PriceType,
  IntervalUnit,
} from '@/types'
import type { Organization } from '@/db/schema/organizations'
import type { DbTransaction } from '@/db/types'
import core from '../core'

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

describe('externalIdFromProductData', () => {
  it('returns the hashData value for a product input', () => {
    const dummy: SetupCatalogProductInput = {
      product: {
        name: 'Test',
        default: false,
        description: '',
        slug: 'test',
        active: true,
        imageURL: null,
        displayFeatures: null,
        singularQuantityLabel: null,
        pluralQuantityLabel: null,
      },
      prices: [],
      features: [],
    }
    const expected = hashData(
      JSON.stringify({ ...dummy, catalogId: 'catalogId' })
    )
    expect(externalIdFromProductData(dummy, 'catalogId')).toEqual(
      expected
    )
  })

  it('returns a consistent hash for identical inputs', () => {
    const dummy: SetupCatalogProductInput = {
      product: {
        name: 'Test',
        default: false,
        description: '',
        slug: 'test',
        active: true,
        imageURL: null,
        displayFeatures: null,
        singularQuantityLabel: null,
        pluralQuantityLabel: null,
      },
      prices: [],
      features: [],
    }
    const h1 = externalIdFromProductData(dummy, 'catalogId')
    const h2 = externalIdFromProductData(dummy, 'catalogId')
    expect(h1).toEqual(h2)
  })
})

describe('setupCatalogTransaction (integration)', () => {
  it('throws if input validation fails', async () => {
    await expect(
      adminTransaction(async ({ transaction }) =>
        setupCatalogTransaction(
          {
            input: {} as any,
            organizationId: organization.id,
            livemode: false,
          },
          transaction
        )
      )
    ).rejects.toThrow()
  })

  it('throws when a UsageCreditGrant feature has no matching usage meter', async () => {
    const input: SetupCatalogInput = {
      name: 'Catalog',
      isDefault: false,
      usageMeters: [],
      features: [
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'f1',
          name: 'Feat1',
          description: '',
          livemode: false,
          usageMeterSlug: 'missing',
          amount: 1,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
      ],
      products: [
        {
          product: {
            name: 'P',
            default: false,
            description: '',
            slug: 'p',
            active: true,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [],
          features: ['f1'],
        },
      ],
    }
    await expect(
      adminTransaction(async ({ transaction }) =>
        setupCatalogTransaction(
          { input, organizationId: organization.id, livemode: false },
          transaction
        )
      )
    ).rejects.toThrow('Usage meter with slug missing does not exist')
  })

  it('creates catalog, features, products, prices, and productFeatures on happy path', async () => {
    const input: SetupCatalogInput = {
      name: 'MyCatalog',
      isDefault: false,
      usageMeters: [{ slug: 'um', name: 'UM' }],
      features: [
        {
          type: FeatureType.UsageCreditGrant,
          slug: 'f1',
          name: 'Feat1',
          description: '',
          livemode: false,
          usageMeterSlug: 'um',
          amount: 10,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'f2',
          name: 'Feat2',
          description: '',
          livemode: false,
          active: true,
        },
      ],
      products: [
        {
          product: {
            name: 'P1',
            default: false,
            description: 'd',
            slug: 'p1',
            active: true,
            imageURL: null,
            displayFeatures: null,
            singularQuantityLabel: null,
            pluralQuantityLabel: null,
          },
          prices: [
            {
              type: PriceType.Subscription,
              slug: 'ps',
              isDefault: false,
              name: null,
              usageMeterId: null,
              trialPeriodDays: null,
              setupFeeAmount: null,
              usageEventsPerUnit: null,
              overagePriceId: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 100,
              startsWithCreditTrial: false,
            },
            {
              type: PriceType.Usage,
              slug: 'pu',
              isDefault: false,
              name: null,
              usageMeterSlug: 'um',
              trialPeriodDays: null,
              setupFeeAmount: null,
              usageEventsPerUnit: 1,
              overagePriceId: null,
              active: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 5,
              startsWithCreditTrial: false,
            },
          ],
          features: ['f1', 'f2'],
        },
      ],
    }

    const result = await adminTransaction(async ({ transaction }) =>
      setupCatalogTransaction(
        { input, organizationId: organization.id, livemode: false },
        transaction
      )
    )

    // Catalog
    expect(result.catalog.id).toBeDefined()
    expect(result.catalog.name).toEqual(input.name)
    expect(result.catalog.livemode).toEqual(false)
    expect(result.catalog.organizationId).toEqual(organization.id)
    expect(result.catalog.isDefault).toEqual(input.isDefault)

    // Features
    expect(result.features).toHaveLength(input.features.length)
    expect(result.features.map((f) => f.slug)).toEqual(
      input.features.map((f) => f.slug)
    )

    // Products
    expect(result.products).toHaveLength(input.products.length)
    expect(result.products.map((p) => p.slug)).toEqual(
      input.products.map((p) => p.product.slug)
    )
    expect(
      result.products.every((p) => typeof p.externalId === 'string')
    ).toBe(true)

    // Prices
    const allPriceSlugs = input.products.flatMap((p) =>
      p.prices.map((pr) => pr.slug!)
    )
    expect(result.prices).toHaveLength(allPriceSlugs.length)
    expect(result.prices.map((pr) => pr.slug)).toEqual(allPriceSlugs)

    // ProductFeatures
    const totalFeatures = input.products.flatMap((p) => p.features)
    expect(result.productFeatures).toHaveLength(totalFeatures.length)
    const productIds = result.products.map((p) => p.id)
    const featureIds = result.features.map((f) => f.id)
    result.productFeatures.forEach((pf) => {
      expect(productIds).toContain(pf.productId)
      expect(featureIds).toContain(pf.featureId)
    })
  })
})
