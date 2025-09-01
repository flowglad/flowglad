import { describe, it, expect, beforeEach } from 'vitest'
import {
  createCustomerBookkeeping,
  createPricingModelBookkeeping,
} from './bookkeeping'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupProduct,
  setupPrice,
  setupPricingModel,
} from '@/../seedDatabase'
import {
  IntervalUnit,
  PriceType,
  FlowgladEventType,
  CurrencyCode,
  BusinessOnboardingStatus,
  StripeConnectContractType,
} from '@/types'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { PricingModel } from '@/db/schema/pricingModels'
import { UsageMeter } from '@/db/schema/usageMeters'
import { selectPricingModelById } from '@/db/tableMethods/pricingModelMethods'
import { selectSubscriptionAndItems } from '@/db/tableMethods/subscriptionItemMethods'
import { selectProducts } from '@/db/tableMethods/productMethods'
import { selectPrices } from '@/db/tableMethods/priceMethods'
import { insertOrganization } from '@/db/tableMethods/organizationMethods'
import core from '@/utils/core'
import { selectCountries } from '@/db/tableMethods/countryMethods'

const livemode = true
describe('createCustomerBookkeeping', () => {
  let organization: Organization.Record
  let product: Product.Record
  let price: Price.Record
  let defaultPricingModel: PricingModel.Record
  let defaultProduct: Product.Record
  let defaultPrice: Price.Record

  beforeEach(async () => {
    // Set up organization with default product and pricing
    const orgData = await setupOrg()
    organization = orgData.organization
    product = orgData.product
    price = orgData.price

    // Get the default pricing model that was created
    defaultPricingModel = await adminTransaction(
      async ({ transaction }) => {
        const pricingModel = await selectPricingModelById(
          orgData.pricingModel.id,
          transaction
        )
        return pricingModel
      }
    )

    // Create a default product for the default pricing model
    defaultProduct = await setupProduct({
      organizationId: organization.id,
      name: 'Default Product',
      pricingModelId: defaultPricingModel.id,
      default: true,
      active: true,
    })

    // Create a default price for the default product
    defaultPrice = await setupPrice({
      productId: defaultProduct.id,
      name: 'Default Price',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      isDefault: true,
      setupFeeAmount: 0,
      trialPeriodDays: 14,
      currency: CurrencyCode.USD,
      livemode,
    })
  })

  describe('customer creation with automatic subscription', () => {
    it('should create a customer with a default subscription when no pricing model is specified', async () => {
      // setup:
      // - organization already has a default pricing model with default product and price
      // - create a new customer without specifying a pricing model

      // Create customer through the bookkeeping function
      const result = await adminTransaction(
        async ({ transaction }) => {
          const output = await createCustomerBookkeeping(
            {
              customer: {
                email: `test+${core.nanoid()}@example.com`,
                name: 'Test Customer',
                organizationId: organization.id,
                externalId: `ext_${core.nanoid()}`,
              },
            },
            {
              transaction,
              organizationId: organization.id,
              userId: 'user_test',
              livemode,
            }
          )
          return output
        }
      )

      // expects:
      // - customer should be created successfully
      // - subscription should be created for the customer
      // - subscription should use the default product and price
      // - events should include CustomerCreated and SubscriptionCreated
      expect(result.result.customer).toBeDefined()
      expect(result.result.customer.email).toContain('test+')
      expect(result.result.customer.organizationId).toBe(
        organization.id
      )

      expect(result.result.subscription).toBeDefined()
      expect(result.result.subscriptionItems).toBeDefined()
      expect(result.result.subscriptionItems?.length).toBeGreaterThan(
        0
      )

      // Verify the subscription was actually created in the dataFree
      const subscriptionInDb = await adminTransaction(
        async ({ transaction }) => {
          const sub = await selectSubscriptionAndItems(
            {
              customerId: result.result.customer.id,
            },
            transaction
          )
          return sub
        }
      )
      expect(subscriptionInDb).toBeDefined()
      expect(subscriptionInDb?.subscription.customerId).toBe(
        result.result.customer.id
      )

      // Verify events were created
      expect(result.eventsToLog).toBeDefined()
      expect(result.eventsToLog?.length).toBeGreaterThan(0)
      expect(
        result.eventsToLog?.some(
          (e) => e.type === FlowgladEventType.CustomerCreated
        )
      ).toBe(true)
      expect(
        result.eventsToLog?.some(
          (e) => e.type === FlowgladEventType.SubscriptionCreated
        )
      ).toBe(true)
    })

    it('should create a customer with subscription from specified pricing model', async () => {
      // setup:
      // - create a different pricing model with its own default product and price
      // - create a customer specifying this pricing model

      // Create a different pricing model
      const customPricingModel = await setupPricingModel({
        organizationId: organization.id,
        name: 'Custom Pricing Model',
        isDefault: false,
      })

      // Create a default product for the custom pricing model
      const customProduct = await setupProduct({
        organizationId: organization.id,
        name: 'Custom Default Product',
        pricingModelId: customPricingModel.id,
        default: true,
        active: true,
      })

      // Create a default price for the custom product
      const customPrice = await setupPrice({
        productId: customProduct.id,
        name: 'Custom Default Price',
        type: PriceType.Subscription,
        unitPrice: 2000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        isDefault: true,
        setupFeeAmount: 0,
        currency: CurrencyCode.USD,
        livemode: customProduct.livemode,
      })

      // Create customer with specified pricing model
      const result = await adminTransaction(
        async ({ transaction }) => {
          const output = await createCustomerBookkeeping(
            {
              customer: {
                email: `test+${core.nanoid()}@example.com`,
                name: 'Test Customer with Custom Pricing',
                organizationId: organization.id,
                externalId: `ext_${core.nanoid()}`,
                pricingModelId: customPricingModel.id,
              },
            },
            {
              transaction,
              organizationId: organization.id,
              userId: 'user_test',
              livemode: customProduct.livemode,
            }
          )
          return output
        }
      )

      // expects:
      // - customer should be created with the specified pricing model
      // - subscription should use the custom pricing model's default product and price
      // - subscription price should be 2000 (custom price) not 1000 (default price)
      expect(result.result.customer).toBeDefined()
      expect(result.result.customer.pricingModelId).toBe(
        customPricingModel.id
      )

      expect(result.result.subscription).toBeDefined()

      // Verify the subscription uses the correct price
      const subscriptionInDb = await adminTransaction(
        async ({ transaction }) => {
          const sub = await selectSubscriptionAndItems(
            {
              customerId: result.result.customer.id,
            },
            transaction
          )
          return sub
        }
      )
      expect(subscriptionInDb).toBeDefined()
      // The subscription items should be associated with the custom product
      expect(subscriptionInDb?.subscriptionItems[0].priceId).toBe(
        customPrice.id
      )
    })

    it('should create customer without subscription if no default product exists', async () => {
      // setup:
      // - create a pricing model without any default product
      // - create a customer with this pricing model

      // Create a pricing model without default products
      const emptyPricingModel = await setupPricingModel({
        organizationId: organization.id,
        name: 'Empty Pricing Model',
        isDefault: false,
      })

      // Create a non-default product (so there's no default product)
      await setupProduct({
        organizationId: organization.id,
        name: 'Non-Default Product',
        pricingModelId: emptyPricingModel.id,
        default: false, // Not default
        active: true,
      })

      // Create customer with the empty pricing model
      const result = await adminTransaction(
        async ({ transaction }) => {
          const output = await createCustomerBookkeeping(
            {
              customer: {
                email: `test+${core.nanoid()}@example.com`,
                name: 'Test Customer No Default Product',
                organizationId: organization.id,
                externalId: `ext_${core.nanoid()}`,
                pricingModelId: emptyPricingModel.id,
              },
            },
            {
              transaction,
              organizationId: organization.id,
              userId: 'user_test',
              livemode,
            }
          )
          return output
        }
      )

      // expects:
      // - customer should be created successfully
      // - no subscription should be created
      // - only CustomerCreated event should exist
      expect(result.result.customer).toBeDefined()
      expect(result.result.subscription).toBeUndefined()
      expect(result.result.subscriptionItems).toBeUndefined()

      // Verify no subscription exists in dataFree
      const subscriptionInDb = await adminTransaction(
        async ({ transaction }) => {
          const sub = await selectSubscriptionAndItems(
            {
              customerId: result.result.customer.id,
            },
            transaction
          )
          return sub
        }
      )
      expect(subscriptionInDb).toBeNull()

      // Verify only CustomerCreated event exists
      expect(result.eventsToLog).toBeDefined()
      expect(
        result.eventsToLog?.some(
          (e) => e.type === FlowgladEventType.CustomerCreated
        )
      ).toBe(true)
      expect(
        result.eventsToLog?.some(
          (e) => e.type === FlowgladEventType.SubscriptionCreated
        )
      ).toBe(false)
    })

    it('should create customer without subscription if no default price exists', async () => {
      // setup:
      // - create a pricing model with a default product but no default price
      // - create a customer with this pricing model

      // Create a pricing model
      const pricingModelNoDefaultPrice = await setupPricingModel({
        organizationId: organization.id,
        name: 'Pricing Model No Default Price',
        isDefault: false,
      })

      // Create a default product
      const productWithoutDefaultPrice = await setupProduct({
        organizationId: organization.id,
        name: 'Product Without Default Price',
        pricingModelId: pricingModelNoDefaultPrice.id,
        default: true,
        active: true,
      })

      // Create a non-default price
      await setupPrice({
        productId: productWithoutDefaultPrice.id,
        name: 'Non-Default Price',
        type: PriceType.Subscription,
        unitPrice: 3000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        isDefault: false, // Not default
        setupFeeAmount: 0,
        currency: CurrencyCode.USD,
        livemode,
      })

      // Create customer
      const result = await adminTransaction(
        async ({ transaction }) => {
          const output = await createCustomerBookkeeping(
            {
              customer: {
                email: `test+${core.nanoid()}@example.com`,
                name: 'Test Customer No Default Price',
                organizationId: organization.id,
                externalId: `ext_${core.nanoid()}`,
                pricingModelId: pricingModelNoDefaultPrice.id,
              },
            },
            {
              transaction,
              organizationId: organization.id,
              userId: 'user_test',
              livemode,
            }
          )
          return output
        }
      )

      // expects:
      // - customer should be created successfully
      // - no subscription should be created since there's no default price
      // - only CustomerCreated event should exist
      expect(result.result.customer).toBeDefined()
      expect(result.result.subscription).toBeUndefined()
      expect(result.result.subscriptionItems).toBeUndefined()

      // Verify no subscription exists in dataFree
      const subscriptionInDb = await adminTransaction(
        async ({ transaction }) => {
          const sub = await selectSubscriptionAndItems(
            {
              customerId: result.result.customer.id,
            },
            transaction
          )
          return sub
        }
      )
      expect(subscriptionInDb).toBeNull()

      // Verify only CustomerCreated event exists
      expect(result.eventsToLog).toBeDefined()
      expect(
        result.eventsToLog?.some(
          (e) => e.type === FlowgladEventType.CustomerCreated
        )
      ).toBe(true)
      expect(
        result.eventsToLog?.some(
          (e) => e.type === FlowgladEventType.SubscriptionCreated
        )
      ).toBe(false)
    })

    it('should handle subscription with trial period correctly', async () => {
      // setup:
      // - default price already has 14 day trial period
      // - create a customer and verify trial end date is set

      const result = await adminTransaction(
        async ({ transaction }) => {
          const output = await createCustomerBookkeeping(
            {
              customer: {
                email: `test+${core.nanoid()}@example.com`,
                name: 'Test Customer with Trial',
                organizationId: organization.id,
                externalId: `ext_${core.nanoid()}`,
              },
            },
            {
              transaction,
              organizationId: organization.id,
              userId: 'user_test',
              livemode,
            }
          )
          return output
        }
      )

      // expects:
      // - customer and subscription should be created
      // - subscription should have a trial end date approximately 14 days from now
      expect(result.result.customer).toBeDefined()
      expect(result.result.subscription).toBeDefined()

      const subscriptionInDb = await adminTransaction(
        async ({ transaction }) => {
          const sub = await selectSubscriptionAndItems(
            {
              customerId: result.result.customer.id,
            },
            transaction
          )
          return sub
        }
      )

      expect(subscriptionInDb).toBeDefined()
      // Trial end should be set and approximately 14 days from now
      if (subscriptionInDb?.subscription.trialEnd) {
        const trialEndTime = new Date(
          subscriptionInDb.subscription.trialEnd
        ).getTime()
        const expectedTrialEndTime =
          Date.now() + 14 * 24 * 60 * 60 * 1000
        // Allow 1 minute tolerance for test execution time
        expect(
          Math.abs(trialEndTime - expectedTrialEndTime)
        ).toBeLessThan(60 * 1000)
      }
    })

    it('should create customer without subscription when no pricing model exists at all', async () => {
      // setup:
      // - create an organization without any pricing models
      // - create a customer without specifying a pricing model

      // Create a new org without default pricing model setup
      const minimalOrg = await adminTransaction(
        async ({ transaction }) => {
          const [country] = await selectCountries(
            { code: 'US' },
            transaction
          )
          const org = await insertOrganization(
            {
              name: `Minimal Org ${core.nanoid()}`,
              defaultCurrency: CurrencyCode.USD,
              countryId: country.id,
              onboardingStatus:
                BusinessOnboardingStatus.FullyOnboarded,
              stripeConnectContractType:
                StripeConnectContractType.Platform,
              featureFlags: {},
            },
            transaction
          )
          return org
        }
      )

      // Create customer for the minimal org
      const result = await adminTransaction(
        async ({ transaction }) => {
          const output = await createCustomerBookkeeping(
            {
              customer: {
                email: `test+${core.nanoid()}@example.com`,
                name: 'Test Customer No Pricing Model',
                organizationId: minimalOrg.id,
                externalId: `ext_${core.nanoid()}`,
              },
            },
            {
              transaction,
              organizationId: minimalOrg.id,
              userId: 'user_test',
              livemode,
            }
          )
          return output
        }
      )

      // expects:
      // - customer should be created successfully
      // - no subscription should be created since there's no pricing model
      // - only CustomerCreated event should exist
      expect(result.result.customer).toBeDefined()
      expect(result.result.customer.organizationId).toBe(
        minimalOrg.id
      )
      expect(result.result.subscription).toBeUndefined()
      expect(result.result.subscriptionItems).toBeUndefined()

      // Verify only CustomerCreated event exists
      expect(result.eventsToLog).toBeDefined()
      expect(
        result.eventsToLog?.some(
          (e) => e.type === FlowgladEventType.CustomerCreated
        )
      ).toBe(true)
      expect(
        result.eventsToLog?.some(
          (e) => e.type === FlowgladEventType.SubscriptionCreated
        )
      ).toBe(false)
    })

    it('should prevent cross-organization customer creation', async () => {
      // Setup: Create a second organization
      const { organization: otherOrganization } = await setupOrg()

      // Attempt to create a customer with mismatched organizationId
      await expect(
        adminTransaction(async ({ transaction }) => {
          await createCustomerBookkeeping(
            {
              customer: {
                email: `test+${core.nanoid()}@example.com`,
                name: 'Cross Org Customer',
                organizationId: otherOrganization.id, // Different from auth context
                externalId: `ext_${core.nanoid()}`,
              },
            },
            {
              transaction,
              organizationId: organization.id, // Auth context org
              userId: 'user_test',
              livemode,
            }
          )
        })
      ).rejects.toThrow(
        'Customer organizationId must match authenticated organizationId'
      )
    })

    it('should properly set subscription metadata and name', async () => {
      // setup:
      // - create a customer and verify the subscription has proper metadata

      const result = await adminTransaction(
        async ({ transaction }) => {
          const output = await createCustomerBookkeeping(
            {
              customer: {
                email: `test+${core.nanoid()}@example.com`,
                name: 'Test Customer Metadata',
                organizationId: organization.id,
                externalId: `ext_${core.nanoid()}`,
              },
            },
            {
              transaction,
              organizationId: organization.id,
              userId: 'user_test',
              livemode,
            }
          )
          return output
        }
      )

      // expects:
      // - subscription should be created with proper name
      // - subscription name should include the default product name
      expect(result.result.subscription).toBeDefined()

      const subscriptionInDb = await adminTransaction(
        async ({ transaction }) => {
          const sub = await selectSubscriptionAndItems(
            {
              customerId: result.result.customer.id,
            },
            transaction
          )
          return sub
        }
      )

      expect(subscriptionInDb).toBeDefined()
      expect(subscriptionInDb?.subscription.name).toContain(
        'Default Product'
      )
      expect(subscriptionInDb?.subscription.name).toContain(
        'Subscription'
      )
    })
  })
})

describe('createPricingModelBookkeeping', () => {
  let organizationId: string
  const livemode = true

  beforeEach(async () => {
    // Set up a basic organization
    const { organization } = await setupOrg()
    organizationId = organization.id
  })

  describe('pricing model creation with automatic default product', () => {
    it('should create a pricing model with a default product and price', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          const output = await createPricingModelBookkeeping(
            {
              pricingModel: {
                name: 'New Pricing Model',
                isDefault: false,
              },
            },
            {
              transaction,
              organizationId,
              livemode,
            }
          )
          return output
        }
      )

      // Verify the pricing model was created
      expect(result.result.pricingModel).toBeDefined()
      expect(result.result.pricingModel.name).toBe(
        'New Pricing Model'
      )
      expect(result.result.pricingModel.isDefault).toBe(false)
      expect(result.result.pricingModel.organizationId).toBe(
        organizationId
      )
      expect(result.result.pricingModel.livemode).toBe(livemode)

      // Verify the default product was created
      expect(result.result.defaultProduct).toBeDefined()
      expect(result.result.defaultProduct.name).toBe('Free Plan')
      expect(result.result.defaultProduct.slug).toBe('free')
      expect(result.result.defaultProduct.default).toBe(true)
      expect(result.result.defaultProduct.pricingModelId).toBe(
        result.result.pricingModel.id
      )
      expect(result.result.defaultProduct.organizationId).toBe(
        organizationId
      )
      expect(result.result.defaultProduct.livemode).toBe(livemode)
      expect(result.result.defaultProduct.active).toBe(true)

      // Verify the default price was created
      expect(result.result.defaultPrice).toBeDefined()
      expect(result.result.defaultPrice.productId).toBe(
        result.result.defaultProduct.id
      )
      expect(result.result.defaultPrice.unitPrice).toBe(0)
      expect(result.result.defaultPrice.isDefault).toBe(true)
      expect(result.result.defaultPrice.type).toBe(
        PriceType.Subscription
      )
      expect(result.result.defaultPrice.intervalUnit).toBe(
        IntervalUnit.Month
      )
      expect(result.result.defaultPrice.intervalCount).toBe(1)
      expect(result.result.defaultPrice.livemode).toBe(livemode)
      expect(result.result.defaultPrice.active).toBe(true)
      expect(result.result.defaultPrice.name).toBe('Free Plan')
    })

    it('should create a non-default pricing model with default product', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          const output = await createPricingModelBookkeeping(
            {
              pricingModel: {
                name: 'Another Pricing Model',
                isDefault: false, // Can't create another default, setupOrg already created one
              },
            },
            {
              transaction,
              organizationId,
              livemode,
            }
          )
          return output
        }
      )

      // Verify the pricing model is not marked as default (since one already exists)
      expect(result.result.pricingModel.isDefault).toBe(false)

      // Verify the default product and price were still created
      expect(result.result.defaultProduct.default).toBe(true)
      expect(result.result.defaultPrice.unitPrice).toBe(0)
    })

    it('should use organization default currency for the default price', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          const output = await createPricingModelBookkeeping(
            {
              pricingModel: {
                name: 'Currency Test Pricing Model',
                isDefault: false,
              },
            },
            {
              transaction,
              organizationId,
              livemode,
            }
          )
          return output
        }
      )

      // Verify the price uses the organization's default currency
      expect(result.result.defaultPrice.currency).toBe(
        CurrencyCode.USD
      )
    })
  })
})
