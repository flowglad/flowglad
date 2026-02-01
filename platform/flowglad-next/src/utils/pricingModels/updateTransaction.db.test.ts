import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  FeatureType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  PriceType} from '@db-core/enums'
import type { Organization } from '@db-core/schema/organizations'
import { Result } from 'better-result'
import { setupOrg, teardownOrg } from '@/../seedDatabase'
import {
  adminTransaction} from '@/db/adminTransaction'
import { selectFeatures } from '@/db/tableMethods/featureMethods'
import { selectPrices } from '@/db/tableMethods/priceMethods'
import { selectProductFeatures } from '@/db/tableMethods/productFeatureMethods'
import { selectProducts } from '@/db/tableMethods/productMethods'
import { selectResources } from '@/db/tableMethods/resourceMethods'
import { selectUsageMeters } from '@/db/tableMethods/usageMeterMethods'
import type { SetupPricingModelInput } from './setupSchemas'
import { setupPricingModelTransaction } from './setupTransaction'
import { updatePricingModelTransaction } from './updateTransaction'

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

/**
 * Helper to create a basic pricing model for testing updates.
 * Usage prices belong to usage meters, not products.
 */
const createBasicPricingModel = async (
  overrides: Partial<SetupPricingModelInput> = {}
) => {
  // Usage meters have nested structure with prices
  // Transform any old-style flat usage meters to nested structure with default prices
  const processedUsageMeters: SetupPricingModelInput['usageMeters'] =
    (overrides.usageMeters ?? []).map((meter) => {
      // If already in new format (has usageMeter property), use as-is
      if ('usageMeter' in meter) {
        return meter
      }
      // Otherwise, transform from old flat format
      const meterData = meter as { slug: string; name: string }
      return {
        usageMeter: {
          slug: meterData.slug,
          name: meterData.name},
        prices: [
          {
            type: PriceType.Usage as const,
            slug: `${meterData.slug}-usage-price`,
            unitPrice: 10,
            isDefault: true,
            active: true,
            intervalCount: 1,
            intervalUnit: IntervalUnit.Month,
            usageEventsPerUnit: 100,
            trialPeriodDays: null},
        ]}
    })

  const baseProducts: SetupPricingModelInput['products'] = [
    {
      product: {
        name: 'Starter Plan',
        slug: 'starter',
        default: false,
        active: true},
      price: {
        type: PriceType.Subscription,
        name: undefined,
        slug: 'starter-monthly',
        unitPrice: 1999,
        isDefault: true,
        active: true,
        intervalCount: 1,
        intervalUnit: IntervalUnit.Month,
        trialPeriodDays: undefined,
        usageMeterId: null,
        usageEventsPerUnit: null},
      features: ['feature-a']},
  ]

  // Products only contain subscription/single payment prices
  // No more usage price products - usage prices live under usage meters
  const finalProducts = overrides.products ?? baseProducts

  const input: SetupPricingModelInput = {
    name: 'Test Pricing Model',
    isDefault: false,
    features: [
      {
        type: FeatureType.Toggle,
        slug: 'feature-a',
        name: 'Feature A',
        description: 'A toggle feature',
        active: true},
    ],
    ...overrides,
    usageMeters: processedUsageMeters,
    products: finalProducts}

  return (
    await adminTransaction(async (ctx) => {
      return Result.ok(
        await (
          await setupPricingModelTransaction(
            {
              input,
              organizationId: organization.id,
              livemode: false},
            ctx
          )
        ).unwrap()
      )
    })
  ).unwrap()
}

describe('updatePricingModelTransaction', () => {
  describe('pricing model metadata updates', () => {
    it('updates the pricing model name without affecting child records', async () => {
      const setupResult = await createBasicPricingModel({
        name: 'Old Name'})

      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'New Name',
                  isDefault: false,
                  usageMeters: [],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.pricingModel.name).toBe('New Name')
      expect(updateResult.features.created).toHaveLength(0)
      expect(updateResult.features.updated).toHaveLength(0)
      expect(updateResult.products.created).toHaveLength(0)
      expect(updateResult.products.updated).toHaveLength(0)
    })

    it('updates the isDefault flag', async () => {
      const setupResult = await createBasicPricingModel({
        isDefault: false})

      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: true,
                  usageMeters: [],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.pricingModel.isDefault).toBe(true)
    })
  })

  describe('usage meter updates', () => {
    it('creates new usage meters', async () => {
      const setupResult = await createBasicPricingModel({
        usageMeters: [
          {
            usageMeter: { slug: 'api-calls', name: 'API Calls' },
            prices: [
              {
                type: PriceType.Usage,
                slug: 'api-calls-usage-price',
                unitPrice: 10,
                isDefault: true,
                active: true,
                intervalCount: 1,
                intervalUnit: IntervalUnit.Month,
                usageEventsPerUnit: 100,
                trialPeriodDays: null},
            ]},
        ]})

      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [
                    {
                      usageMeter: {
                        slug: 'api-calls',
                        name: 'API Calls'},
                      prices: [
                        {
                          type: PriceType.Usage,
                          slug: 'api-calls-usage-price',
                          unitPrice: 10,
                          isDefault: true,
                          active: true,
                          intervalCount: 1,
                          intervalUnit: IntervalUnit.Month,
                          usageEventsPerUnit: 100,
                          trialPeriodDays: null},
                      ]},
                    {
                      usageMeter: {
                        slug: 'storage',
                        name: 'Storage'},
                      prices: [
                        {
                          type: PriceType.Usage,
                          slug: 'storage-usage-price',
                          unitPrice: 5,
                          isDefault: true,
                          active: true,
                          intervalCount: 1,
                          intervalUnit: IntervalUnit.Month,
                          usageEventsPerUnit: 1000,
                          trialPeriodDays: null},
                      ]},
                  ],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  // Products only have subscription/single payment prices
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.usageMeters.created).toHaveLength(1)
      expect(updateResult.usageMeters.created[0].slug).toBe('storage')
      expect(updateResult.usageMeters.created[0].name).toBe('Storage')

      // Verify usage meter prices were also created
      // The new "storage" meter should have its price created
      const storageUsagePrice = updateResult.prices.created.find(
        (p) => p.slug === 'storage-usage-price'
      )
      expect(storageUsagePrice?.type).toBe(PriceType.Usage)
      expect(storageUsagePrice?.unitPrice).toBe(5)
      expect(storageUsagePrice?.usageMeterId).toBe(
        updateResult.usageMeters.created[0].id
      )
    })

    it('updates existing usage meter name', async () => {
      const setupResult = await createBasicPricingModel({
        usageMeters: [
          {
            usageMeter: { slug: 'api-calls', name: 'API Calls' },
            prices: [
              {
                type: PriceType.Usage,
                slug: 'api-calls-usage-price',
                unitPrice: 10,
                isDefault: true,
                active: true,
                intervalCount: 1,
                intervalUnit: IntervalUnit.Month,
                usageEventsPerUnit: 100,
                trialPeriodDays: null},
            ]},
        ]})

      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [
                    {
                      usageMeter: {
                        slug: 'api-calls',
                        name: 'API Requests'},
                      prices: [
                        {
                          type: PriceType.Usage,
                          slug: 'api-calls-usage-price',
                          unitPrice: 10,
                          isDefault: true,
                          active: true,
                          intervalCount: 1,
                          intervalUnit: IntervalUnit.Month,
                          usageEventsPerUnit: 100,
                          trialPeriodDays: null},
                      ]},
                  ],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.usageMeters.updated).toHaveLength(1)
      expect(updateResult.usageMeters.updated[0].name).toBe(
        'API Requests'
      )
    })

    it('throws when trying to remove usage meters', async () => {
      const setupResult = await createBasicPricingModel({
        usageMeters: [
          {
            usageMeter: { slug: 'api-calls', name: 'API Calls' },
            prices: [
              {
                type: PriceType.Usage,
                slug: 'api-calls-usage-price',
                unitPrice: 10,
                isDefault: true,
                active: true,
                intervalCount: 1,
                intervalUnit: IntervalUnit.Month,
                usageEventsPerUnit: 100,
                trialPeriodDays: null},
            ]},
          {
            usageMeter: { slug: 'storage', name: 'Storage' },
            prices: [
              {
                type: PriceType.Usage,
                slug: 'storage-usage-price',
                unitPrice: 5,
                isDefault: true,
                active: true,
                intervalCount: 1,
                intervalUnit: IntervalUnit.Month,
                usageEventsPerUnit: 1,
                trialPeriodDays: null},
            ]},
        ]})

      await expect(
        comprehensiveAdminTransaction(
          async (params) => {
            const result = (
              await updatePricingModelTransaction(
                {
                  pricingModelId: setupResult.pricingModel.id,
                  proposedInput: {
                    name: 'Test Pricing Model',
                    isDefault: false,
                    usageMeters: [
                      {
                        usageMeter: {
                          slug: 'api-calls',
                          name: 'API Calls'},
                        prices: [
                          {
                            type: PriceType.Usage,
                            slug: 'api-calls-usage-price',
                            unitPrice: 10,
                            isDefault: true,
                            active: true,
                            intervalCount: 1,
                            intervalUnit: IntervalUnit.Month,
                            usageEventsPerUnit: 100,
                            trialPeriodDays: null},
                        ]},
                    ],
                    features: [
                      {
                        type: FeatureType.Toggle,
                        slug: 'feature-a',
                        name: 'Feature A',
                        description: 'A toggle feature',
                        active: true},
                    ],
                    products: [
                      {
                        product: {
                          name: 'Starter Plan',
                          slug: 'starter',
                          default: false,
                          active: true},
                        price: {
                          type: PriceType.Subscription,
                          slug: 'starter-monthly',
                          unitPrice: 1999,
                          isDefault: true,
                          active: true,
                          intervalCount: 1,
                          intervalUnit: IntervalUnit.Month,
                          usageMeterId: null,
                          usageEventsPerUnit: null},
                        features: ['feature-a']},
                    ]}},
                params
              )
            ).unwrap()
            return Result.ok(result)
          },
          { livemode: false }
        )
      ).rejects.toThrow('Usage meters cannot be removed')
    })
  })

  describe('resource updates', () => {
    it('creates new resources when added to proposed input', async () => {
      const setupResult = await createBasicPricingModel()

      // Update with resources array
      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  resources: [
                    { slug: 'seats', name: 'Seats' },
                    { slug: 'projects', name: 'Projects' },
                  ],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.resources.created).toHaveLength(2)
      expect(
        updateResult.resources.created.map((r) => r.slug).sort()
      ).toEqual(['projects', 'seats'])
      expect(updateResult.resources.created[0].pricingModelId).toBe(
        setupResult.pricingModel.id
      )
      expect(updateResult.resources.created[0].active).toBe(true)
    })

    it('updates existing resources when properties change', async () => {
      // First create a pricing model with resources
      const setupResult = await createBasicPricingModel()

      // Add resources first
      (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  resources: [{ slug: 'seats', name: 'Seats' }],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        name: undefined,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        trialPeriodDays: undefined,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      // Now update the resource name
      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  resources: [{ slug: 'seats', name: 'Team Seats' }],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        name: undefined,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        trialPeriodDays: undefined,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.resources.updated).toHaveLength(1)
      expect(updateResult.resources.updated[0].slug).toBe('seats')
      expect(updateResult.resources.updated[0].name).toBe(
        'Team Seats'
      )
    })

    it('deactivates resources removed from proposed input', async () => {
      // First create a pricing model with resources
      const setupResult = await createBasicPricingModel()

      // Add resources first
      (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  resources: [
                    { slug: 'seats', name: 'Seats' },
                    { slug: 'projects', name: 'Projects' },
                  ],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      // Now remove 'projects' resource
      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  resources: [{ slug: 'seats', name: 'Seats' }],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.resources.deactivated).toHaveLength(1)
      expect(updateResult.resources.deactivated[0].slug).toBe(
        'projects'
      )
      expect(updateResult.resources.deactivated[0].active).toBe(false)

      // Verify database state
      const allResources = (
        await adminTransaction(async (ctx) => {
          return Result.ok(
            await selectResources(
              { pricingModelId: setupResult.pricingModel.id },
              ctx.transaction
            )
          )
        })
      ).unwrap()
      const activeResources = allResources.filter((r) => r.active)
      expect(activeResources).toHaveLength(1)
      expect(activeResources[0].slug).toBe('seats')
    })

    it('does not modify unchanged resources', async () => {
      // First create a pricing model with resources
      const setupResult = await createBasicPricingModel()

      // Add resources first
      (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  resources: [
                    { slug: 'seats', name: 'Seats', active: true },
                  ],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        name: undefined,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        trialPeriodDays: undefined,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      // Now update with same resources
      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  resources: [
                    { slug: 'seats', name: 'Seats', active: true },
                  ],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        name: undefined,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        trialPeriodDays: undefined,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.resources.created).toHaveLength(0)
      expect(updateResult.resources.updated).toHaveLength(0)
      expect(updateResult.resources.deactivated).toHaveLength(0)
    })
  })

  describe('resource feature updates', () => {
    it('creates new Resource features with correct resourceId', async () => {
      // First create a pricing model with a resource but no Resource features
      const setupResult = await createBasicPricingModel()

      // Add a resource first
      (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  resources: [{ slug: 'seats', name: 'Seats' }],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      // Get the resource ID
      const resources = (
        await adminTransaction(async (ctx) => {
          return Result.ok(
            await selectResources(
              { pricingModelId: setupResult.pricingModel.id },
              ctx.transaction
            )
          )
        })
      ).unwrap()
      const seatsResource = resources.find((r) => r.slug === 'seats')

      // Now add a Resource feature referencing the resource
      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  resources: [{ slug: 'seats', name: 'Seats' }],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                    {
                      type: FeatureType.Resource,
                      slug: 'seat-grant',
                      name: 'Seat Grant',
                      description: 'Grants seats to the subscription',
                      resourceSlug: 'seats',
                      amount: 5,
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a', 'seat-grant']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.features.created).toHaveLength(1)
      const createdFeature = updateResult.features.created[0]
      expect(createdFeature.slug).toBe('seat-grant')
      expect(createdFeature.type).toBe(FeatureType.Resource)
      expect(createdFeature.resourceId).toBe(seatsResource!.id)
      expect(createdFeature.amount).toBe(5)
      expect(createdFeature.usageMeterId).toBeNull()
      expect(createdFeature.renewalFrequency).toBeNull()
    })

    it('transforms resourceSlug to resourceId when updating Resource feature', async () => {
      // First create a pricing model with two resources and a Resource feature
      const setupResult = await createBasicPricingModel()

      // Add resources and a Resource feature
      (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  resources: [
                    { slug: 'seats', name: 'Seats' },
                    { slug: 'projects', name: 'Projects' },
                  ],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                    {
                      type: FeatureType.Resource,
                      slug: 'resource-grant',
                      name: 'Resource Grant',
                      description:
                        'Grants a resource to the subscription',
                      resourceSlug: 'seats',
                      amount: 5,
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a', 'resource-grant']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      // Get the resource IDs
      const resources = (
        await adminTransaction(async (ctx) => {
          return Result.ok(
            await selectResources(
              { pricingModelId: setupResult.pricingModel.id },
              ctx.transaction
            )
          )
        })
      ).unwrap()
      const projectsResource = resources.find(
        (r) => r.slug === 'projects'
      )

      // Now update the Resource feature to reference projects instead of seats
      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  resources: [
                    { slug: 'seats', name: 'Seats' },
                    { slug: 'projects', name: 'Projects' },
                  ],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                    {
                      type: FeatureType.Resource,
                      slug: 'resource-grant',
                      name: 'Resource Grant Updated',
                      description: 'Now grants projects instead',
                      resourceSlug: 'projects', // Changed from 'seats' to 'projects'
                      amount: 10, // Changed amount too
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a', 'resource-grant']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.features.updated).toHaveLength(1)
      const updatedFeature = updateResult.features.updated[0]
      expect(updatedFeature.slug).toBe('resource-grant')
      expect(updatedFeature.name).toBe('Resource Grant Updated')
      expect(updatedFeature.resourceId).toBe(projectsResource!.id)
      expect(updatedFeature.amount).toBe(10)
    })

    it('throws when Resource feature references non-existent resource', async () => {
      const setupResult = await createBasicPricingModel()

      // Add a resource first
      (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  resources: [{ slug: 'seats', name: 'Seats' }],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      // Try to add a Resource feature referencing a non-existent resource
      await expect(
        comprehensiveAdminTransaction(
          async (params) => {
            const result = (
              await updatePricingModelTransaction(
                {
                  pricingModelId: setupResult.pricingModel.id,
                  proposedInput: {
                    name: 'Test Pricing Model',
                    isDefault: false,
                    usageMeters: [],
                    resources: [{ slug: 'seats', name: 'Seats' }],
                    features: [
                      {
                        type: FeatureType.Toggle,
                        slug: 'feature-a',
                        name: 'Feature A',
                        description: 'A toggle feature',
                        active: true},
                      {
                        type: FeatureType.Resource,
                        slug: 'invalid-grant',
                        name: 'Invalid Grant',
                        description:
                          'References a non-existent resource',
                        resourceSlug: 'non-existent-resource',
                        amount: 5,
                        active: true},
                    ],
                    products: [
                      {
                        product: {
                          name: 'Starter Plan',
                          slug: 'starter',
                          default: false,
                          active: true},
                        price: {
                          type: PriceType.Subscription,
                          slug: 'starter-monthly',
                          unitPrice: 1999,
                          isDefault: true,
                          active: true,
                          intervalCount: 1,
                          intervalUnit: IntervalUnit.Month,
                          usageMeterId: null,
                          usageEventsPerUnit: null},
                        features: ['feature-a', 'invalid-grant']},
                    ]}},
                params
              )
            ).unwrap()
            return Result.ok(result)
          },
          { livemode: false }
        )
      ).rejects.toThrow('Resource not found: non-existent-resource')
    })

    it('deactivates Resource features when removed from proposed input', async () => {
      const setupResult = await createBasicPricingModel()

      // Add a resource and Resource feature
      (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  resources: [{ slug: 'seats', name: 'Seats' }],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                    {
                      type: FeatureType.Resource,
                      slug: 'seat-grant',
                      name: 'Seat Grant',
                      description: 'Grants seats',
                      resourceSlug: 'seats',
                      amount: 5,
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a', 'seat-grant']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      // Now remove the Resource feature
      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  resources: [{ slug: 'seats', name: 'Seats' }],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                    // seat-grant feature removed
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.features.deactivated).toHaveLength(1)
      const deactivatedFeature = updateResult.features.deactivated[0]
      expect(deactivatedFeature.slug).toBe('seat-grant')
      expect(deactivatedFeature.type).toBe(FeatureType.Resource)
      expect(deactivatedFeature.active).toBe(false)

      // Verify database state
      const allFeatures = (
        await adminTransaction(async (ctx) => {
          return Result.ok(
            await selectFeatures(
              { pricingModelId: setupResult.pricingModel.id },
              ctx.transaction
            )
          )
        })
      ).unwrap()
      const seatGrantFeature = allFeatures.find(
        (f) => f.slug === 'seat-grant'
      )
      expect(seatGrantFeature!.active).toBe(false)
    })

    it('creates new resources and Resource features that use those resources in the same update', async () => {
      const setupResult = await createBasicPricingModel()

      // Add both resources and Resource features in a single update
      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  resources: [
                    { slug: 'seats', name: 'Seats' },
                    { slug: 'projects', name: 'Projects' },
                  ],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                    {
                      type: FeatureType.Resource,
                      slug: 'seat-grant',
                      name: 'Seat Grant',
                      description: 'Grants seats',
                      resourceSlug: 'seats',
                      amount: 5,
                      active: true},
                    {
                      type: FeatureType.Resource,
                      slug: 'project-grant',
                      name: 'Project Grant',
                      description: 'Grants projects',
                      resourceSlug: 'projects',
                      amount: 3,
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: [
                        'feature-a',
                        'seat-grant',
                        'project-grant',
                      ]},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      // Verify resources created
      expect(updateResult.resources.created).toHaveLength(2)
      expect(
        updateResult.resources.created.map((r) => r.slug).sort()
      ).toEqual(['projects', 'seats'])

      // Verify Resource features created with correct resourceIds
      expect(updateResult.features.created).toHaveLength(2)
      const seatGrant = updateResult.features.created.find(
        (f) => f.slug === 'seat-grant'
      )
      const projectGrant = updateResult.features.created.find(
        (f) => f.slug === 'project-grant'
      )
      const seatsResource = updateResult.resources.created.find(
        (r) => r.slug === 'seats'
      )
      const projectsResource = updateResult.resources.created.find(
        (r) => r.slug === 'projects'
      )

      expect(seatGrant!.type).toBe(FeatureType.Resource)
      expect(seatGrant!.resourceId).toBe(seatsResource!.id)
      expect(seatGrant!.amount).toBe(5)

      expect(projectGrant!.type).toBe(FeatureType.Resource)
      expect(projectGrant!.resourceId).toBe(projectsResource!.id)
      expect(projectGrant!.amount).toBe(3)
    })
  })

  describe('feature updates', () => {
    it('creates new features', async () => {
      const setupResult = await createBasicPricingModel()

      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-b',
                      name: 'Feature B',
                      description: 'Another toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.features.created).toHaveLength(1)
      expect(updateResult.features.created[0].slug).toBe('feature-b')
    })

    it('updates existing feature name', async () => {
      const setupResult = await createBasicPricingModel()

      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A Updated',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.features.updated).toHaveLength(1)
      expect(updateResult.features.updated[0].name).toBe(
        'Feature A Updated'
      )
    })

    it('soft-deletes removed features by setting active=false', async () => {
      const setupResult = await createBasicPricingModel({
        features: [
          {
            type: FeatureType.Toggle,
            slug: 'feature-a',
            name: 'Feature A',
            description: 'A toggle feature',
            active: true},
          {
            type: FeatureType.Toggle,
            slug: 'feature-b',
            name: 'Feature B',
            description: 'Another toggle feature',
            active: true},
        ],
        products: [
          {
            product: {
              name: 'Starter Plan',
              slug: 'starter',
              default: false,
              active: true},
            price: {
              type: PriceType.Subscription,
              slug: 'starter-monthly',
              unitPrice: 1999,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageMeterId: null,
              usageEventsPerUnit: null},
            features: ['feature-a', 'feature-b']},
        ]})

      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.features.deactivated).toHaveLength(1)
      expect(updateResult.features.deactivated[0].slug).toBe(
        'feature-b'
      )
      expect(updateResult.features.deactivated[0].active).toBe(false)
    })

    it('throws when trying to change feature type', async () => {
      const setupResult = await createBasicPricingModel({
        usageMeters: [
          {
            usageMeter: { slug: 'api-calls', name: 'API Calls' },
            prices: [
              {
                type: PriceType.Usage,
                slug: 'api-calls-usage-price',
                unitPrice: 10,
                isDefault: true,
                active: true,
                intervalCount: 1,
                intervalUnit: IntervalUnit.Month,
                usageEventsPerUnit: 100,
                trialPeriodDays: null},
            ]},
        ]})

      await expect(
        comprehensiveAdminTransaction(
          async (params) => {
            const result = (
              await updatePricingModelTransaction(
                {
                  pricingModelId: setupResult.pricingModel.id,
                  proposedInput: {
                    name: 'Test Pricing Model',
                    isDefault: false,
                    usageMeters: [
                      {
                        usageMeter: {
                          slug: 'api-calls',
                          name: 'API Calls'},
                        prices: [
                          {
                            type: PriceType.Usage,
                            slug: 'api-calls-usage-price',
                            unitPrice: 10,
                            isDefault: true,
                            active: true,
                            intervalCount: 1,
                            intervalUnit: IntervalUnit.Month,
                            usageEventsPerUnit: 100,
                            trialPeriodDays: null},
                        ]},
                    ],
                    features: [
                      {
                        type: FeatureType.UsageCreditGrant,
                        slug: 'feature-a',
                        name: 'Feature A',
                        description: 'Changed to usage credit grant',
                        usageMeterSlug: 'api-calls',
                        amount: 100,
                        renewalFrequency:
                          FeatureUsageGrantFrequency.EveryBillingPeriod,
                        active: true},
                    ],
                    products: [
                      {
                        product: {
                          name: 'Starter Plan',
                          slug: 'starter',
                          default: false,
                          active: true},
                        price: {
                          type: PriceType.Subscription,
                          slug: 'starter-monthly',
                          unitPrice: 1999,
                          isDefault: true,
                          active: true,
                          intervalCount: 1,
                          intervalUnit: IntervalUnit.Month,
                          usageMeterId: null,
                          usageEventsPerUnit: null},
                        features: ['feature-a']},
                    ]}},
                params
              )
            ).unwrap()
            return Result.ok(result)
          },
          { livemode: false }
        )
      ).rejects.toThrow('Feature type cannot be changed')
    })
  })

  describe('product updates', () => {
    it('creates new products with prices', async () => {
      const setupResult = await createBasicPricingModel()

      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                    {
                      product: {
                        name: 'Pro Plan',
                        slug: 'pro',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'pro-monthly',
                        unitPrice: 4999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.products.created).toHaveLength(1)
      expect(updateResult.products.created[0].slug).toBe('pro')
      // 2 prices created: one for the new 'pro' product, one for auto-generated 'free' product replacement
      expect(
        updateResult.prices.created.length
      ).toBeGreaterThanOrEqual(1)
      const proPriceCreated = updateResult.prices.created.find(
        (p) => p.slug === 'pro-monthly'
      )
      expect(proPriceCreated?.unitPrice).toBe(4999)
    })

    it('updates existing product metadata without affecting price', async () => {
      const setupResult = await createBasicPricingModel()

      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan Updated',
                        slug: 'starter',
                        default: false,
                        active: true,
                        description: 'Now with a description!'},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.products.updated).toHaveLength(1)
      expect(updateResult.products.updated[0].name).toBe(
        'Starter Plan Updated'
      )
      expect(updateResult.products.updated[0].description).toBe(
        'Now with a description!'
      )
      // Note: "free" product was auto-generated in setup but not included in proposed,
      // however it is protected by protectDefaultProduct and preserved
      expect(updateResult.products.deactivated).toHaveLength(0)
    })

    it('soft-deletes removed products and their prices', async () => {
      const setupResult = await createBasicPricingModel({
        products: [
          {
            product: {
              name: 'Starter Plan',
              slug: 'starter',
              default: false,
              active: true},
            price: {
              type: PriceType.Subscription,
              slug: 'starter-monthly',
              unitPrice: 1999,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageMeterId: null,
              usageEventsPerUnit: null},
            features: ['feature-a']},
          {
            product: {
              name: 'Pro Plan',
              slug: 'pro',
              default: false,
              active: true},
            price: {
              type: PriceType.Subscription,
              slug: 'pro-monthly',
              unitPrice: 4999,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageMeterId: null,
              usageEventsPerUnit: null},
            features: ['feature-a']},
        ]})

      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        // Match the existing price schema from getPricingModelSetupData
                        name: undefined,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        trialPeriodDays: undefined,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      // 1 product deactivated: 'pro' (explicitly removed)
      // Note: 'free' (auto-generated default) is protected and preserved by protectDefaultProduct
      expect(updateResult.products.deactivated).toHaveLength(1)
      const proDeactivated = updateResult.products.deactivated.find(
        (p) => p.slug === 'pro'
      )
      expect(proDeactivated!.active).toBe(false)

      // 1 price deactivated: pro-monthly
      // Note: free product's price is preserved since the default product is protected
      expect(updateResult.prices.deactivated).toHaveLength(1)
      const proMonthlyDeactivated =
        updateResult.prices.deactivated.find(
          (p) => p.slug === 'pro-monthly'
        )
      expect(proMonthlyDeactivated!.active).toBe(false)
    })

    it('creates new price and deactivates old price when price changes', async () => {
      const setupResult = await createBasicPricingModel()

      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 2999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      // Price for starter changed (1999 -> 2999), plus free product deactivated
      expect(
        updateResult.prices.created.length
      ).toBeGreaterThanOrEqual(1)
      const starterPriceCreated = updateResult.prices.created.find(
        (p) => p.unitPrice === 2999
      )
      expect(starterPriceCreated!.active).toBe(true)

      // 2 prices deactivated: starter-monthly (old price) + free (auto-generated product removed)
      expect(
        updateResult.prices.deactivated.length
      ).toBeGreaterThanOrEqual(1)
      const starterPriceDeactivated =
        updateResult.prices.deactivated.find(
          (p) => p.unitPrice === 1999
        )
      expect(starterPriceDeactivated!.active).toBe(false)
    })
  })

  describe('productFeature junction table sync', () => {
    it('adds new feature associations when products gain features', async () => {
      const setupResult = await createBasicPricingModel({
        features: [
          {
            type: FeatureType.Toggle,
            slug: 'feature-a',
            name: 'Feature A',
            description: 'A toggle feature',
            active: true},
          {
            type: FeatureType.Toggle,
            slug: 'feature-b',
            name: 'Feature B',
            description: 'Another toggle feature',
            active: true},
        ],
        products: [
          {
            product: {
              name: 'Starter Plan',
              slug: 'starter',
              default: false,
              active: true},
            price: {
              type: PriceType.Subscription,
              slug: 'starter-monthly',
              unitPrice: 1999,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageMeterId: null,
              usageEventsPerUnit: null},
            features: ['feature-a']},
        ]})

      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-b',
                      name: 'Feature B',
                      description: 'Another toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a', 'feature-b']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.productFeatures.added).toHaveLength(1)
      expect(updateResult.productFeatures.removed).toHaveLength(0)
    })

    it('removes feature associations when products lose features', async () => {
      const setupResult = await createBasicPricingModel({
        features: [
          {
            type: FeatureType.Toggle,
            slug: 'feature-a',
            name: 'Feature A',
            description: 'A toggle feature',
            active: true},
          {
            type: FeatureType.Toggle,
            slug: 'feature-b',
            name: 'Feature B',
            description: 'Another toggle feature',
            active: true},
        ],
        products: [
          {
            product: {
              name: 'Starter Plan',
              slug: 'starter',
              default: false,
              active: true},
            price: {
              type: PriceType.Subscription,
              slug: 'starter-monthly',
              unitPrice: 1999,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageMeterId: null,
              usageEventsPerUnit: null},
            features: ['feature-a', 'feature-b']},
        ]})

      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-b',
                      name: 'Feature B',
                      description: 'Another toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.productFeatures.added).toHaveLength(0)
      expect(updateResult.productFeatures.removed).toHaveLength(1)
    })

    it('does not modify productFeatures when no changes', async () => {
      const setupResult = await createBasicPricingModel()

      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.productFeatures.added).toHaveLength(0)
      expect(updateResult.productFeatures.removed).toHaveLength(0)
    })
  })

  describe('new features and new products in same update', () => {
    it('creates new features and products that use those features in the same update', async () => {
      const setupResult = await createBasicPricingModel()

      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-new',
                      name: 'New Feature',
                      description: 'A newly added feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                    {
                      product: {
                        name: 'New Product',
                        slug: 'new-product',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'new-product-monthly',
                        unitPrice: 2999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-new']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.features.created).toHaveLength(1)
      expect(updateResult.features.created[0].slug).toBe(
        'feature-new'
      )
      expect(updateResult.products.created).toHaveLength(1)
      expect(updateResult.products.created[0].slug).toBe(
        'new-product'
      )
      expect(updateResult.productFeatures.added).toHaveLength(1)

      // Verify the productFeature links the new product to the new feature
      const newProductId = updateResult.products.created[0].id
      const newFeatureId = updateResult.features.created[0].id
      const addedProductFeature =
        updateResult.productFeatures.added[0]
      expect(addedProductFeature.productId).toBe(newProductId)
      expect(addedProductFeature.featureId).toBe(newFeatureId)
    })

    it('creates new usage meters and features that use those meters in the same update', async () => {
      const setupResult = await createBasicPricingModel()

      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [
                    {
                      usageMeter: {
                        slug: 'api-calls',
                        name: 'API Calls'},
                      prices: [
                        {
                          type: PriceType.Usage,
                          slug: 'api-usage-price',
                          unitPrice: 10,
                          isDefault: true,
                          active: true,
                          intervalCount: 1,
                          intervalUnit: IntervalUnit.Month,
                          usageEventsPerUnit: 100,
                          trialPeriodDays: null},
                      ]},
                  ],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                    {
                      type: FeatureType.UsageCreditGrant,
                      slug: 'api-credits',
                      name: 'API Credits',
                      description: 'Monthly API credits',
                      usageMeterSlug: 'api-calls',
                      amount: 1000,
                      renewalFrequency:
                        FeatureUsageGrantFrequency.EveryBillingPeriod,
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 1999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a', 'api-credits']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      expect(updateResult.usageMeters.created).toHaveLength(1)
      expect(updateResult.usageMeters.created[0].slug).toBe(
        'api-calls'
      )
      expect(updateResult.features.created).toHaveLength(1)
      expect(updateResult.features.created[0].slug).toBe(
        'api-credits'
      )
      expect(updateResult.features.created[0].type).toBe(
        FeatureType.UsageCreditGrant
      )
      expect(updateResult.features.created[0].usageMeterId).toBe(
        updateResult.usageMeters.created[0].id
      )
    })
  })

  describe('complex scenario', () => {
    it('handles multiple simultaneous changes including renaming, adding, and removing', async () => {
      const setupResult = await createBasicPricingModel({
        name: 'Old Name',
        features: [
          {
            type: FeatureType.Toggle,
            slug: 'feature-a',
            name: 'Feature A',
            description: 'A toggle feature',
            active: true},
          {
            type: FeatureType.Toggle,
            slug: 'feature-b',
            name: 'Feature B',
            description: 'Another toggle feature',
            active: true},
        ],
        products: [
          {
            product: {
              name: 'Starter Plan',
              slug: 'starter',
              default: false,
              active: true},
            price: {
              type: PriceType.Subscription,
              slug: 'starter-monthly',
              unitPrice: 1999,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageMeterId: null,
              usageEventsPerUnit: null},
            features: ['feature-a', 'feature-b']},
          {
            product: {
              name: 'Pro Plan',
              slug: 'pro',
              default: false,
              active: true},
            price: {
              type: PriceType.Subscription,
              slug: 'pro-monthly',
              unitPrice: 4999,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageMeterId: null,
              usageEventsPerUnit: null},
            features: ['feature-a', 'feature-b']},
        ]})

      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'New Name',
                  isDefault: false,
                  usageMeters: [],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A Renamed',
                      description: 'A toggle feature',
                      active: true},
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-c',
                      name: 'Feature C',
                      description: 'A new feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan Updated',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 2499,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a', 'feature-c']},
                    {
                      product: {
                        name: 'Enterprise Plan',
                        slug: 'enterprise',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'enterprise-monthly',
                        unitPrice: 9999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a', 'feature-c']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      // Pricing model renamed
      expect(updateResult.pricingModel.name).toBe('New Name')

      // Feature A renamed, feature B removed, feature C added
      expect(updateResult.features.created).toHaveLength(1)
      expect(updateResult.features.created[0].slug).toBe('feature-c')
      expect(updateResult.features.updated).toHaveLength(1)
      expect(updateResult.features.updated[0].slug).toBe('feature-a')
      expect(updateResult.features.updated[0].name).toBe(
        'Feature A Renamed'
      )
      expect(updateResult.features.deactivated).toHaveLength(1)
      expect(updateResult.features.deactivated[0].slug).toBe(
        'feature-b'
      )

      // Starter updated (name + price), Pro removed, Enterprise added
      // Note: 'free' auto-generated product is protected and preserved by protectDefaultProduct
      expect(updateResult.products.created).toHaveLength(1)
      expect(updateResult.products.created[0].slug).toBe('enterprise')
      expect(updateResult.products.updated).toHaveLength(1)
      expect(updateResult.products.updated[0].name).toBe(
        'Starter Plan Updated'
      )
      // 1 product deactivated: 'pro' (free is protected)
      expect(updateResult.products.deactivated).toHaveLength(1)
      const proDeactivated = updateResult.products.deactivated.find(
        (p) => p.slug === 'pro'
      )
      expect(typeof proDeactivated).toBe('object')

      // Starter price changed
      expect(
        updateResult.prices.created.length
      ).toBeGreaterThanOrEqual(2)
      expect(
        updateResult.prices.deactivated.length
      ).toBeGreaterThanOrEqual(1)

      // Verify database state
      const allProducts = (
        await adminTransaction(async (ctx) => {
          return Result.ok(
            await selectProducts(
              { pricingModelId: setupResult.pricingModel.id },
              ctx.transaction
            )
          )
        })
      ).unwrap()
      const activeProducts = allProducts.filter((p) => p.active)
      // 3 active products: enterprise, starter, and the protected free product
      expect(activeProducts).toHaveLength(3)
      expect(activeProducts.map((p) => p.slug).sort()).toEqual([
        'enterprise',
        'free',
        'starter',
      ])
    })
  })

  describe('database state verification', () => {
    it('correctly persists all changes to the database', async () => {
      const setupResult = await createBasicPricingModel({
        features: [
          {
            type: FeatureType.Toggle,
            slug: 'feature-a',
            name: 'Feature A',
            description: 'A toggle feature',
            active: true},
        ],
        products: [
          {
            product: {
              name: 'Starter Plan',
              slug: 'starter',
              default: false,
              active: true},
            price: {
              type: PriceType.Subscription,
              slug: 'starter-monthly',
              unitPrice: 1999,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageMeterId: null,
              usageEventsPerUnit: null},
            features: ['feature-a']},
        ]})

      (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Updated Pricing Model',
                  isDefault: false,
                  usageMeters: [
                    {
                      usageMeter: {
                        slug: 'api-calls',
                        name: 'API Calls'},
                      prices: [
                        {
                          type: PriceType.Usage,
                          slug: 'api-usage-price',
                          unitPrice: 10,
                          isDefault: true,
                          active: true,
                          intervalCount: 1,
                          intervalUnit: IntervalUnit.Month,
                          usageEventsPerUnit: 100,
                          trialPeriodDays: null},
                      ]},
                  ],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A Updated',
                      description: 'A toggle feature',
                      active: true},
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-b',
                      name: 'Feature B',
                      description: 'New feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Starter Plan',
                        slug: 'starter',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'starter-monthly',
                        unitPrice: 2999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a', 'feature-b']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      // Verify database state
      const [usageMeters, features, products, productFeatures] = (
        await Promise.all([
          adminTransaction(async (ctx) => {
            return Result.ok(
              await selectUsageMeters(
                { pricingModelId: setupResult.pricingModel.id },
                ctx.transaction
              )
            )
          }),
          adminTransaction(async (ctx) => {
            return Result.ok(
              await selectFeatures(
                { pricingModelId: setupResult.pricingModel.id },
                ctx.transaction
              )
            )
          }),
          adminTransaction(async (ctx) => {
            return Result.ok(
              await selectProducts(
                { pricingModelId: setupResult.pricingModel.id },
                ctx.transaction
              )
            )
          }),
          adminTransaction(async (ctx) => {
            const prods = await selectProducts(
              { pricingModelId: setupResult.pricingModel.id },
              ctx.transaction
            )
            return Result.ok(
              await selectProductFeatures(
                { productId: prods.map((p) => p.id) },
                ctx.transaction
              )
            )
          }),
        ])
      ).map((r) => r.unwrap())

      // Verify usage meters
      expect(usageMeters).toHaveLength(1)
      expect(usageMeters[0].slug).toBe('api-calls')

      // Verify features
      expect(features).toHaveLength(2)
      const featureA = features.find((f) => f.slug === 'feature-a')
      const featureB = features.find((f) => f.slug === 'feature-b')
      expect(featureA?.name).toBe('Feature A Updated')
      expect(featureB?.name).toBe('Feature B')

      // Verify products (including auto-generated default)
      const activeProducts = products.filter((p) => p.active)
      expect(activeProducts.length).toBeGreaterThanOrEqual(1)
      const starterProduct = activeProducts.find(
        (p) => p.slug === 'starter'
      )
      // Verify prices
      const starterPrices = (
        await adminTransaction(async (ctx) => {
          return Result.ok(
            await selectPrices(
              { productId: starterProduct!.id },
              ctx.transaction
            )
          )
        })
      ).unwrap()
      const activePrice = starterPrices.find((p) => p.active)
      expect(activePrice!.unitPrice).toBe(2999)

      // Verify productFeatures
      const starterProductFeatures = productFeatures.filter(
        (pf) => pf.productId === starterProduct!.id && !pf.expiredAt
      )
      expect(starterProductFeatures).toHaveLength(2)
    })
  })

  describe('default product protection', () => {
    it('prevents removal of default product when proposed input removes it, automatically adding it back', async () => {
      // Setup with explicit default product
      const setupResult = await createBasicPricingModel({
        products: [
          {
            product: {
              name: 'Free Plan',
              slug: 'free',
              default: true,
              active: true},
            price: {
              type: PriceType.Subscription,
              slug: 'free-monthly',
              unitPrice: 0,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageMeterId: null,
              usageEventsPerUnit: null},
            features: ['feature-a']},
          {
            product: {
              name: 'Pro Plan',
              slug: 'pro',
              default: false,
              active: true},
            price: {
              type: PriceType.Subscription,
              slug: 'pro-monthly',
              unitPrice: 2999,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageMeterId: null,
              usageEventsPerUnit: null},
            features: ['feature-a']},
        ]})

      // Try to update without the default product - only include Pro
      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    // Only Pro Plan - Free (default) is missing
                    {
                      product: {
                        name: 'Pro Plan',
                        slug: 'pro',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'pro-monthly',
                        unitPrice: 2999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      // Verify the default product was NOT deactivated (it was auto-added back)
      const freeDeactivated = updateResult.products.deactivated.find(
        (p) => p.slug === 'free'
      )
      expect(freeDeactivated).toBeUndefined()

      // Verify database state - default product should still be active
      const allProducts = (
        await adminTransaction(async (ctx) => {
          return Result.ok(
            await selectProducts(
              { pricingModelId: setupResult.pricingModel.id },
              ctx.transaction
            )
          )
        })
      ).unwrap()
      const activeProducts = allProducts.filter((p) => p.active)
      const freeProduct = activeProducts.find(
        (p) => p.slug === 'free'
      )
      expect(freeProduct!.default).toBe(true)
      expect(freeProduct!.active).toBe(true)
    })

    it('preserves default product protected fields (unitPrice, slug, active) when proposed changes them, while applying allowed changes (name, description)', async () => {
      // Setup with explicit default product
      const setupResult = await createBasicPricingModel({
        products: [
          {
            product: {
              name: 'Free Plan',
              slug: 'free',
              default: true,
              active: true,
              description: 'Original description'},
            price: {
              type: PriceType.Subscription,
              slug: 'free-monthly',
              unitPrice: 0,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageMeterId: null,
              usageEventsPerUnit: null},
            features: ['feature-a']},
        ]})

      // Try to update with protected field changes on the default product
      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Updated Free Plan Name', // Allowed change
                        slug: 'free', // Same slug to identify the product
                        default: true,
                        active: false, // Protected - should be ignored
                        description: 'Updated description', // Allowed change
                      },
                      price: {
                        type: PriceType.Subscription,
                        slug: 'free-monthly',
                        unitPrice: 999, // Protected - should be ignored
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      // Verify database state
      const allProducts = (
        await adminTransaction(async (ctx) => {
          return Result.ok(
            await selectProducts(
              { pricingModelId: setupResult.pricingModel.id },
              ctx.transaction
            )
          )
        })
      ).unwrap()
      const freeProduct = allProducts.find((p) => p.slug === 'free')

      // Protected fields should be preserved
      expect(freeProduct!.active).toBe(true) // Protected - was not changed to false
      expect(freeProduct!.slug).toBe('free') // Protected - preserved

      // Allowed fields should be updated
      expect(freeProduct!.name).toBe('Updated Free Plan Name')
      expect(freeProduct!.description).toBe('Updated description')

      // Price protected fields should be preserved
      const prices = (
        await adminTransaction(async (ctx) => {
          return Result.ok(
            await selectPrices(
              { productId: freeProduct!.id },
              ctx.transaction
            )
          )
        })
      ).unwrap()
      const activePrice = prices.find((p) => p.active)
      expect(activePrice!.unitPrice).toBe(0) // Protected - was not changed to 999
    })

    it('allows changing only name, description, and features on default product without affecting other fields', async () => {
      // Setup with explicit default product with features
      const setupResult = await createBasicPricingModel({
        features: [
          {
            type: FeatureType.Toggle,
            slug: 'feature-a',
            name: 'Feature A',
            description: 'A toggle feature',
            active: true},
          {
            type: FeatureType.Toggle,
            slug: 'feature-b',
            name: 'Feature B',
            description: 'Another toggle feature',
            active: true},
        ],
        products: [
          {
            product: {
              name: 'Free Plan',
              slug: 'free',
              default: true,
              active: true,
              description: 'Original description'},
            price: {
              type: PriceType.Subscription,
              slug: 'free-monthly',
              unitPrice: 0,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageMeterId: null,
              usageEventsPerUnit: null},
            features: ['feature-a'], // Original feature
          },
        ]})

      // Update only allowed fields on the default product
      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-b',
                      name: 'Feature B',
                      description: 'Another toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'New Free Plan Name', // Allowed change
                        slug: 'free',
                        default: true,
                        active: true, // Not changing protected field
                        description: 'New description', // Allowed change
                      },
                      price: {
                        type: PriceType.Subscription,
                        slug: 'free-monthly',
                        unitPrice: 0, // Not changing protected field
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a', 'feature-b'], // Allowed change - adding feature-b
                    },
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      // Verify database state
      const allProducts = (
        await adminTransaction(async (ctx) => {
          return Result.ok(
            await selectProducts(
              { pricingModelId: setupResult.pricingModel.id },
              ctx.transaction
            )
          )
        })
      ).unwrap()
      const freeProduct = allProducts.find((p) => p.slug === 'free')

      // Allowed fields should be updated
      expect(freeProduct!.name).toBe('New Free Plan Name')
      expect(freeProduct!.description).toBe('New description')

      // Protected fields should be unchanged
      expect(freeProduct!.active).toBe(true)
      expect(freeProduct!.slug).toBe('free')
      expect(freeProduct!.default).toBe(true)

      // Features should be updated (features are allowed to change)
      expect(updateResult.productFeatures.added).toHaveLength(1)
      const productFeatures = (
        await adminTransaction(async (ctx) => {
          return Result.ok(
            await selectProductFeatures(
              { productId: freeProduct!.id },
              ctx.transaction
            )
          )
        })
      ).unwrap()
      const activeFeatures = productFeatures.filter(
        (pf) => !pf.expiredAt
      )
      expect(activeFeatures).toHaveLength(2) // feature-a and feature-b

      // Price should be unchanged
      const prices = (
        await adminTransaction(async (ctx) => {
          return Result.ok(
            await selectPrices(
              { productId: freeProduct!.id },
              ctx.transaction
            )
          )
        })
      ).unwrap()
      const activePrice = prices.find((p) => p.active)
      expect(activePrice!.unitPrice).toBe(0)
      expect(activePrice!.intervalUnit).toBe(IntervalUnit.Month)
    })

    it('preserves default: true when proposed attempts to demote existing default product by setting default: false, avoiding duplicate slugs', async () => {
      // Setup with explicit default product
      const setupResult = await createBasicPricingModel({
        products: [
          {
            product: {
              name: 'Free Plan',
              slug: 'free',
              default: true,
              active: true},
            price: {
              type: PriceType.Subscription,
              slug: 'free-monthly',
              unitPrice: 0,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageMeterId: null,
              usageEventsPerUnit: null},
            features: ['feature-a']},
          {
            product: {
              name: 'Pro Plan',
              slug: 'pro',
              default: false,
              active: true},
            price: {
              type: PriceType.Subscription,
              slug: 'pro-monthly',
              unitPrice: 2999,
              isDefault: true,
              active: true,
              intervalCount: 1,
              intervalUnit: IntervalUnit.Month,
              usageMeterId: null,
              usageEventsPerUnit: null},
            features: ['feature-a']},
        ]})

      // Attempt to demote the default product by setting default: false
      const updateResult = (await adminTransaction(
        async (params) => {
          const result = (
            await updatePricingModelTransaction(
              {
                pricingModelId: setupResult.pricingModel.id,
                proposedInput: {
                  name: 'Test Pricing Model',
                  isDefault: false,
                  usageMeters: [],
                  features: [
                    {
                      type: FeatureType.Toggle,
                      slug: 'feature-a',
                      name: 'Feature A',
                      description: 'A toggle feature',
                      active: true},
                  ],
                  products: [
                    {
                      product: {
                        name: 'Demoted Free Plan', // Allowed change
                        slug: 'free', // Same slug as existing default
                        default: false, // Attempting to demote
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'free-monthly',
                        unitPrice: 0,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                    {
                      product: {
                        name: 'Pro Plan',
                        slug: 'pro',
                        default: false,
                        active: true},
                      price: {
                        type: PriceType.Subscription,
                        slug: 'pro-monthly',
                        unitPrice: 2999,
                        isDefault: true,
                        active: true,
                        intervalCount: 1,
                        intervalUnit: IntervalUnit.Month,
                        usageMeterId: null,
                        usageEventsPerUnit: null},
                      features: ['feature-a']},
                  ]}},
              params
            )
          ).unwrap()
          return Result.ok(result)
        },
        { livemode: false }
      ).unwrap()

      // Verify database state - should have exactly 2 active products (no duplicates)
      const allProducts = (
        await adminTransaction(async (ctx) => {
          return Result.ok(
            await selectProducts(
              { pricingModelId: setupResult.pricingModel.id },
              ctx.transaction
            )
          )
        })
      ).unwrap()
      const activeProducts = allProducts.filter((p) => p.active)
      expect(activeProducts).toHaveLength(2)

      // The free product should preserve default: true
      const freeProduct = activeProducts.find(
        (p) => p.slug === 'free'
      )
      expect(freeProduct!.default).toBe(true)
      expect(freeProduct!.active).toBe(true)

      // The allowed name change should be applied
      expect(freeProduct!.name).toBe('Demoted Free Plan')

      // Pro product should remain non-default
      const proProduct = activeProducts.find((p) => p.slug === 'pro')
      expect(proProduct!.default).toBe(false)
    })
  })
})
