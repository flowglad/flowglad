import { beforeEach, describe, expect, it } from 'bun:test'
import { Result } from 'better-result'
import type Stripe from 'stripe'
import {
  setupCustomer,
  setupInvoice,
  setupInvoiceLineItem,
  setupOrg,
  setupPayment,
  setupPrice,
  setupPricingModel,
  setupProduct,
  setupPurchase,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { Event } from '@/db/schema/events'
import type { Invoice } from '@/db/schema/invoices'
import type { Organization } from '@/db/schema/organizations'
import type { Payment } from '@/db/schema/payments'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import type { Purchase } from '@/db/schema/purchases'
import { UsageMeter } from '@/db/schema/usageMeters'
import { selectBillingPeriods } from '@/db/tableMethods/billingPeriodMethods'
import { selectCountries } from '@/db/tableMethods/countryMethods'
import { selectInvoiceById } from '@/db/tableMethods/invoiceMethods'
import { insertOrganization } from '@/db/tableMethods/organizationMethods'
import {
  selectDefaultPricingModel,
  selectPricingModelById,
  selectPricingModels,
} from '@/db/tableMethods/pricingModelMethods'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import { selectSubscriptionAndItems } from '@/db/tableMethods/subscriptionItemMethods'
import {
  withAdminCacheContext,
  withDiscardingEffectsContext,
} from '@/test-utils/transactionCallbacks'
import {
  BusinessOnboardingStatus,
  CurrencyCode,
  FlowgladEventType,
  IntervalUnit,
  InvoiceStatus,
  PaymentStatus,
  PriceType,
  PurchaseStatus,
  StripeConnectContractType,
} from '@/types'
import core from '@/utils/core'
import {
  createCustomerBookkeeping,
  createFreePlanPriceInsert,
  createPricingModelBookkeeping,
  updateInvoiceStatusToReflectLatestPayment,
  updatePurchaseStatusToReflectLatestPayment,
} from './bookkeeping'

// This test uses setupOrg() which creates livemode entities, so we keep livemode=true
const livemode = true
describe('createCustomerBookkeeping', () => {
  let organization: Organization.Record
  let product: Product.Record
  let price: Price.Record
  let defaultPricingModel: PricingModel.Record
  let defaultProduct: Product.Record
  let defaultPrice: Price.Record

  beforeEach(async () => {
    // Configure the global createStripeCustomer mock to return a fake customer
    globalThis.__mockCreateStripeCustomer.mockReset()
    globalThis.__mockCreateStripeCustomer.mockImplementation(
      async (params: {
        email: string
        name: string
        organizationId: string
        livemode: boolean
        createdBy: string
      }): Promise<Stripe.Customer> => {
        return {
          id: `cus_test_${params.email.replace(/[^a-zA-Z0-9]/g, '')}`,
          object: 'customer',
          email: params.email,
          name: params.name,
          livemode: params.livemode,
          metadata: {
            organizationId: params.organizationId,
            createdBy: params.createdBy,
          },
        } as Stripe.Customer
      }
    )

    // Set up organization with default product and pricing
    const orgData = (await setupOrg()).unwrap()
    organization = orgData.organization
    defaultProduct = orgData.product
    price = orgData.price
    defaultPricingModel = orgData.pricingModel

    // Create a default price for the default product
    defaultPrice = await setupPrice({
      productId: defaultProduct.id,
      name: 'Default Price',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      isDefault: true,
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

      // Capture emitted events
      const emittedEvents: Event.Insert[] = []

      // Create customer through the bookkeeping function
      const result = await adminTransaction(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          // Wrap emitEvent to capture events
          const capturingEmitEvent = (event: Event.Insert) => {
            emittedEvents.push(event)
            emitEvent(event)
          }
          const output = await createCustomerBookkeeping(
            {
              customer: {
                email: `test+${core.nanoid()}@example.com`,
                name: 'Test Customer',
                organizationId: organization.id,
                externalId: `ext_${core.nanoid()}`,
              },
            },
            withAdminCacheContext({
              transaction,
              organizationId: organization.id,
              livemode,
              invalidateCache,
              emitEvent: capturingEmitEvent,
              enqueueLedgerCommand,
            })
          )
          return Result.ok(output)
        }
      )

      // expects:
      // - customer should be created successfully
      // - subscription should be created for the customer
      // - subscription should use the default product and price
      // - events should include CustomerCreated and SubscriptionCreated
      expect(result.customer).toMatchObject({})
      expect(result.customer.email).toContain('test+')
      expect(result.customer.organizationId).toBe(organization.id)

      expect(result.subscription).toMatchObject({})
      expect(result.subscriptionItems).toMatchObject({})
      expect(result.subscriptionItems?.length).toBeGreaterThan(0)

      // Verify the subscription was actually created in the dataFree
      const subscriptionInDb = await adminTransaction(
        async ({ transaction }) => {
          const sub = await selectSubscriptionAndItems(
            {
              customerId: result.customer.id,
            },
            transaction
          )
          return sub
        }
      )
      expect(typeof subscriptionInDb).toBe('object')
      expect(subscriptionInDb?.subscription.customerId).toBe(
        result.customer.id
      )

      // Verify events were emitted
      expect(emittedEvents.length).toBeGreaterThan(0)
      expect(
        emittedEvents.some(
          (e) => e.type === FlowgladEventType.CustomerCreated
        )
      ).toBe(true)
      expect(
        emittedEvents.some(
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
        livemode: false, // Use testmode to avoid livemode uniqueness constraint
      })

      // Create a default product for the custom pricing model
      const customProduct = await setupProduct({
        organizationId: organization.id,
        name: 'Custom Default Product',
        pricingModelId: customPricingModel.id,
        default: true,
        active: true,
        livemode: false,
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
        currency: CurrencyCode.USD,
        livemode: customProduct.livemode,
      })

      // Create customer with specified pricing model
      const result = await adminTransaction(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
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
            withAdminCacheContext({
              transaction,
              organizationId: organization.id,
              livemode: customProduct.livemode,
              invalidateCache,
              emitEvent,
              enqueueLedgerCommand,
            })
          )
          return Result.ok(output)
        }
      )

      // expects:
      // - customer should be created with the specified pricing model
      // - subscription should use the custom pricing model's default product and price
      // - subscription price should be 2000 (custom price) not 1000 (default price)
      expect(result.customer).toMatchObject({})
      expect(result.customer.pricingModelId).toBe(
        customPricingModel.id
      )

      expect(result.subscription).toMatchObject({})

      // Verify the subscription uses the correct price
      const subscriptionInDb = await adminTransaction(
        async ({ transaction }) => {
          const sub = await selectSubscriptionAndItems(
            {
              customerId: result.customer.id,
            },
            transaction
          )
          return sub
        }
      )
      expect(typeof subscriptionInDb).toBe('object')
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
        livemode: false,
      })

      // Create a non-default product (so there's no default product)
      await setupProduct({
        organizationId: organization.id,
        name: 'Non-Default Product',
        pricingModelId: emptyPricingModel.id,
        default: false, // Not default
        active: true,
        livemode: false,
      })

      // Capture emitted events
      const emittedEvents: Event.Insert[] = []

      // Create customer with the empty pricing model
      const result = await adminTransaction(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          const capturingEmitEvent = (event: Event.Insert) => {
            emittedEvents.push(event)
            emitEvent(event)
          }
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
            withAdminCacheContext({
              transaction,
              organizationId: organization.id,
              livemode,
              invalidateCache,
              emitEvent: capturingEmitEvent,
              enqueueLedgerCommand,
            })
          )
          return Result.ok(output)
        }
      )

      // expects:
      // - customer should be created successfully
      // - no subscription should be created
      // - only CustomerCreated event should exist
      expect(result.customer).toMatchObject({})
      expect(result.subscription).toBeUndefined()
      expect(result.subscriptionItems).toBeUndefined()

      // Verify no subscription exists in dataFree
      const subscriptionInDb = await adminTransaction(
        async ({ transaction }) => {
          const sub = await selectSubscriptionAndItems(
            {
              customerId: result.customer.id,
            },
            transaction
          )
          return sub
        }
      )
      expect(subscriptionInDb).toBeNull()

      // Verify only CustomerCreated event was emitted
      expect(
        emittedEvents.some(
          (e) => e.type === FlowgladEventType.CustomerCreated
        )
      ).toBe(true)
      expect(
        emittedEvents.some(
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
        livemode: false,
      })

      // Create a default product
      const productWithoutDefaultPrice = await setupProduct({
        organizationId: organization.id,
        name: 'Product Without Default Price',
        pricingModelId: pricingModelNoDefaultPrice.id,
        default: true,
        active: true,
        livemode: false,
      })

      // Create a non-default price
      // const nonDefaultPrice = await setupPrice({
      //   productId: productWithoutDefaultPrice.id,
      //   name: 'Non-Default Price',
      //   type: PriceType.Subscription,
      //   unitPrice: 3000,
      //   intervalUnit: IntervalUnit.Month,
      //   intervalCount: 1,
      //   isDefault: false, // Not default
      //   currency: CurrencyCode.USD,
      //   livemode,
      // })

      // Capture emitted events
      const emittedEvents: Event.Insert[] = []

      // Create customer
      const result = await adminTransaction(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          const capturingEmitEvent = (event: Event.Insert) => {
            emittedEvents.push(event)
            emitEvent(event)
          }
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
            withAdminCacheContext({
              transaction,
              organizationId: organization.id,
              livemode,
              invalidateCache,
              emitEvent: capturingEmitEvent,
              enqueueLedgerCommand,
            })
          )
          return Result.ok(output)
        }
      )
      // expects:
      // - customer should be created successfully
      // - no subscription should be created since there's no default price
      // - only CustomerCreated event should exist
      expect(result.customer).toMatchObject({})
      expect(result.subscription).toBeUndefined()
      expect(result.subscriptionItems).toBeUndefined()

      // Verify no subscription exists in dataFree
      const subscriptionInDb = await adminTransaction(
        async ({ transaction }) => {
          const sub = await selectSubscriptionAndItems(
            {
              customerId: result.customer.id,
            },
            transaction
          )
          return sub
        }
      )
      expect(subscriptionInDb).toBeNull()

      // Verify only CustomerCreated event was emitted
      expect(
        emittedEvents.some(
          (e) => e.type === FlowgladEventType.CustomerCreated
        )
      ).toBe(true)
      expect(
        emittedEvents.some(
          (e) => e.type === FlowgladEventType.SubscriptionCreated
        )
      ).toBe(false)
    })

    it('should handle subscription with trial period correctly', async () => {
      // setup:
      // - default price already has 14 day trial period
      // - create a customer and verify trial end date is set

      const result = await adminTransaction(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          const output = await createCustomerBookkeeping(
            {
              customer: {
                email: `test+${core.nanoid()}@example.com`,
                name: 'Test Customer with Trial',
                organizationId: organization.id,
                externalId: `ext_${core.nanoid()}`,
              },
            },
            withAdminCacheContext({
              transaction,
              organizationId: organization.id,
              livemode,
              invalidateCache,
              emitEvent,
              enqueueLedgerCommand,
            })
          )
          return Result.ok(output)
        }
      )

      // expects:
      // - customer and subscription should be created
      // - subscription should have a trial end date approximately 14 days from now
      expect(result.customer).toMatchObject({})
      expect(result.subscription).toMatchObject({})

      const subscriptionInDb = await adminTransaction(
        async ({ transaction }) => {
          const sub = await selectSubscriptionAndItems(
            {
              customerId: result.customer.id,
            },
            transaction
          )
          return sub
        }
      )

      expect(typeof subscriptionInDb).toBe('object')
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

    it('should throw error when no pricing model exists for customer creation', async () => {
      // setup:
      // - create an organization without any pricing models
      // - attempt to create a customer without specifying a pricing model
      // - expect an error since pricingModelId is now required (NOT NULL)

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

      // Attempt to create customer for the minimal org - should throw error
      let error: Error | null = null
      try {
        await adminTransaction(
          async ({
            transaction,
            cacheRecomputationContext,
            invalidateCache,
            emitEvent,
            enqueueLedgerCommand,
          }) => {
            await createCustomerBookkeeping(
              {
                customer: {
                  email: `test+${core.nanoid()}@example.com`,
                  name: 'Test Customer No Pricing Model',
                  organizationId: minimalOrg.id,
                  externalId: `ext_${core.nanoid()}`,
                },
              },
              withAdminCacheContext({
                transaction,
                organizationId: minimalOrg.id,
                livemode,
                invalidateCache,
                emitEvent,
                enqueueLedgerCommand,
              })
            )
            return Result.ok(null)
          }
        )
      } catch (err: unknown) {
        error = err as Error
      }

      // expects:
      // - an error should be thrown since pricingModelId is required
      // - no customer should be created
      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toMatch(
        /No pricing model found for customer/i
      )
    })

    it('should prevent cross-organization customer creation', async () => {
      // Setup: Create a second organization
      const { organization: otherOrganization } = (
        await setupOrg()
      ).unwrap()

      // Attempt to create a customer with mismatched organizationId
      await expect(
        adminTransaction(
          async ({
            transaction,
            cacheRecomputationContext,
            invalidateCache,
            emitEvent,
            enqueueLedgerCommand,
          }) => {
            await createCustomerBookkeeping(
              {
                customer: {
                  email: `test+${core.nanoid()}@example.com`,
                  name: 'Cross Org Customer',
                  organizationId: otherOrganization.id, // Different from auth context
                  externalId: `ext_${core.nanoid()}`,
                },
              },
              withAdminCacheContext({
                transaction,
                organizationId: organization.id, // Auth context org
                livemode,
                invalidateCache,
                emitEvent,
                enqueueLedgerCommand,
              })
            )
            return Result.ok(null)
          }
        )
      ).rejects.toThrow(
        'Customer organizationId must match authenticated organizationId'
      )
    })

    it('should properly set subscription metadata and name', async () => {
      // setup:
      // - create a customer and verify the subscription has proper metadata

      const result = await adminTransaction(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          const output = await createCustomerBookkeeping(
            {
              customer: {
                email: `test+${core.nanoid()}@example.com`,
                name: 'Test Customer Metadata',
                organizationId: organization.id,
                externalId: `ext_${core.nanoid()}`,
              },
            },
            withAdminCacheContext({
              transaction,
              organizationId: organization.id,
              livemode,
              invalidateCache,
              emitEvent,
              enqueueLedgerCommand,
            })
          )
          return Result.ok(output)
        }
      )

      // expects:
      // - subscription should be created with proper name
      // - subscription name should include the default product name
      expect(result.subscription).toMatchObject({})

      const subscriptionInDb = await adminTransaction(
        async ({ transaction }) => {
          const sub = await selectSubscriptionAndItems(
            {
              customerId: result.customer.id,
            },
            transaction
          )
          return sub
        }
      )

      expect(typeof subscriptionInDb).toBe('object')
      expect(subscriptionInDb?.subscription.name).toContain(
        // the name of the default product returned by setupOrg
        'Default Product'
      )
      expect(subscriptionInDb?.subscription.name).toContain(
        'Subscription'
      )
    })

    it('should create billing period with start date of now, not one month in the future', async () => {
      // setup:
      // - default price has interval unit (subscription type)
      // - create a customer without payment method (like via UI)
      // - billing period should start approximately now, not one month from now
      //
      // This test verifies the fix for a bug where activateSubscription was
      // generating the "next" billing period from already-set dates, causing
      // subscriptions created via UI to have billing periods starting one month
      // in the future - which prevented migration and archival.

      const now = Date.now()

      const result = await adminTransaction(
        async ({
          transaction,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          const output = await createCustomerBookkeeping(
            {
              customer: {
                email: `test+${core.nanoid()}@example.com`,
                name: 'Test Customer Billing Period Dates',
                organizationId: organization.id,
                externalId: `ext_${core.nanoid()}`,
              },
            },
            withAdminCacheContext({
              transaction,
              organizationId: organization.id,
              livemode,
              invalidateCache,
              emitEvent,
              enqueueLedgerCommand,
            })
          )
          return Result.ok(output)
        }
      )

      // Verify subscription was created
      expect(result.subscription).toMatchObject({})

      // Get subscription and billing periods from database
      const subscriptionInDb = await adminTransaction(
        async ({ transaction }) => {
          const sub = await selectSubscriptionAndItems(
            {
              customerId: result.customer.id,
            },
            transaction
          )
          return sub
        }
      )

      const billingPeriods = await adminTransaction(
        async ({ transaction }) => {
          return await selectBillingPeriods(
            { subscriptionId: result.subscription!.id },
            transaction
          )
        }
      )

      // expects:
      // - subscription's currentBillingPeriodStart should be approximately now
      // - billing period record's startDate should be approximately now
      // - neither should be one month (or more) in the future

      expect(typeof subscriptionInDb).toBe('object')

      // Subscription's billing period dates should start approximately now
      const subscriptionBillingPeriodStart = new Date(
        subscriptionInDb!.subscription.currentBillingPeriodStart!
      ).getTime()

      // Allow 5 minute tolerance for test execution time
      const fiveMinutesTolerance = 5 * 60 * 1000
      expect(
        Math.abs(subscriptionBillingPeriodStart - now)
      ).toBeLessThan(fiveMinutesTolerance)

      // The billing period record should also start approximately now, not one month later
      expect(billingPeriods.length).toBeGreaterThan(0)
      const billingPeriodStartDate = new Date(
        billingPeriods[0].startDate
      ).getTime()
      expect(Math.abs(billingPeriodStartDate - now)).toBeLessThan(
        fiveMinutesTolerance
      )

      // Critical: billing period should NOT be one month in the future
      // If the bug exists, startDate would be ~30 days from now
      const oneMonthFromNow = now + 30 * 24 * 60 * 60 * 1000
      const billingPeriodIsInFuture =
        billingPeriodStartDate >
        oneMonthFromNow - 2 * 24 * 60 * 60 * 1000 // 28+ days away
      expect(billingPeriodIsInFuture).toBe(false)
    })
  })

  describe('subscription behavior based on pricing model price type', () => {
    // Use testmode for these tests to avoid livemode uniqueness constraint
    // (setupOrg creates one livemode PM which we leave untouched)
    const testLivemode = false

    it('should create a non-renewing subscription when default pricing model has SinglePayment price', async () => {
      // Create a pricing model with SinglePayment default price
      const singlePaymentPricingModel = await adminTransaction(
        async ({ transaction }) => {
          const output = await createPricingModelBookkeeping(
            {
              pricingModel: {
                name: 'Single Payment Default Pricing Model',
                isDefault: true,
              },
              // No defaultPlanIntervalUnit - creates SinglePayment price
            },
            withDiscardingEffectsContext({
              transaction,
              organizationId: organization.id,
              livemode: testLivemode,
            })
          )
          return output
        }
      )

      // Verify the pricing model has a SinglePayment default price
      expect(
        singlePaymentPricingModel.unwrap().defaultPrice.type
      ).toBe(PriceType.SinglePayment)

      // Create a customer without specifying pricing model (uses default)
      const result = await adminTransaction(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          const output = await createCustomerBookkeeping(
            {
              customer: {
                email: `test+${core.nanoid()}@example.com`,
                name: 'Test SinglePayment Customer',
                organizationId: organization.id,
                externalId: `ext_${core.nanoid()}`,
                // No pricingModelId - will use default
              },
            },
            withAdminCacheContext({
              transaction,
              organizationId: organization.id,
              livemode: testLivemode,
              invalidateCache,
              emitEvent,
              enqueueLedgerCommand,
            })
          )
          return Result.ok(output)
        }
      )

      // Verify customer and subscription were created
      expect(result.customer).toMatchObject({})
      expect(result.subscription).toMatchObject({})

      // Check the subscription has renews = false for SinglePayment
      const subscription = result.subscription!
      expect(subscription.renews).toBe(false)
      expect(subscription.currentBillingPeriodStart).toBeNull()
      expect(subscription.currentBillingPeriodEnd).toBeNull()

      // Verify no billing period was created
      const billingPeriods = await adminTransaction(
        async ({ transaction }) => {
          return selectBillingPeriods(
            { subscriptionId: subscription.id },
            transaction
          )
        }
      )
      expect(billingPeriods).toHaveLength(0)
    })

    it('should create a renewing subscription with billing period when default pricing model has Subscription price', async () => {
      // Create a pricing model with Subscription default price
      const subscriptionPricingModel = await adminTransaction(
        async ({ transaction }) => {
          const output = await createPricingModelBookkeeping(
            {
              pricingModel: {
                name: 'Subscription Default Pricing Model',
                isDefault: true,
              },
              defaultPlanIntervalUnit: IntervalUnit.Month, // Creates Subscription price
            },
            withDiscardingEffectsContext({
              transaction,
              organizationId: organization.id,
              livemode: testLivemode,
            })
          )
          return output
        }
      )

      // Verify the pricing model has a Subscription default price
      expect(
        subscriptionPricingModel.unwrap().defaultPrice.type
      ).toBe(PriceType.Subscription)

      // Create a customer without specifying pricing model (uses default)
      const result = await adminTransaction(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          const output = await createCustomerBookkeeping(
            {
              customer: {
                email: `test+${core.nanoid()}@example.com`,
                name: 'Test Subscription Customer',
                organizationId: organization.id,
                externalId: `ext_${core.nanoid()}`,
                // No pricingModelId - will use default
              },
            },
            withAdminCacheContext({
              transaction,
              organizationId: organization.id,
              livemode: testLivemode,
              invalidateCache,
              emitEvent,
              enqueueLedgerCommand,
            })
          )
          return Result.ok(output)
        }
      )

      // Verify customer and subscription were created
      expect(result.customer).toMatchObject({})
      expect(result.subscription).toMatchObject({})

      // Check the subscription has renews = true for Subscription
      const subscription = result.subscription!
      expect(subscription.renews).toBe(true)
      expect(subscription.currentBillingPeriodStart).toBeGreaterThan(
        0
      )
      expect(subscription.currentBillingPeriodEnd).toBeGreaterThan(0)

      // Verify billing period was created
      const billingPeriods = await adminTransaction(
        async ({ transaction }) => {
          return selectBillingPeriods(
            { subscriptionId: subscription.id },
            transaction
          )
        }
      )
      expect(billingPeriods).toHaveLength(1)
      expect(billingPeriods[0].startDate).toEqual(
        subscription.currentBillingPeriodStart!
      )
      expect(billingPeriods[0].endDate).toEqual(
        subscription.currentBillingPeriodEnd!
      )
    })

    it('should respect specified pricing model price type when creating customer subscription', async () => {
      // Create two pricing models with different price types
      const singlePaymentPricingModel = await adminTransaction(
        async ({ transaction }) => {
          const output = await createPricingModelBookkeeping(
            {
              pricingModel: {
                name: 'Specific SinglePayment Pricing Model',
                isDefault: false,
              },
              // No interval - SinglePayment
            },
            withDiscardingEffectsContext({
              transaction,
              organizationId: organization.id,
              livemode: testLivemode,
            })
          )
          return output
        }
      )

      const subscriptionPricingModel = await adminTransaction(
        async ({ transaction }) => {
          const output = await createPricingModelBookkeeping(
            {
              pricingModel: {
                name: 'Specific Subscription Pricing Model',
                isDefault: false,
              },
              defaultPlanIntervalUnit: IntervalUnit.Year, // Subscription with Year
            },
            withDiscardingEffectsContext({
              transaction,
              organizationId: organization.id,
              livemode: testLivemode,
            })
          )
          return output
        }
      )

      // Test 1: Customer with SinglePayment pricing model
      const singlePaymentCustomerResult = await adminTransaction(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          const output = await createCustomerBookkeeping(
            {
              customer: {
                email: `test+${core.nanoid()}@example.com`,
                name: 'Customer with SinglePayment Model',
                organizationId: organization.id,
                externalId: `ext_${core.nanoid()}`,
                pricingModelId:
                  singlePaymentPricingModel.unwrap().pricingModel.id,
              },
            },
            withAdminCacheContext({
              transaction,
              organizationId: organization.id,
              livemode: testLivemode,
              invalidateCache,
              emitEvent,
              enqueueLedgerCommand,
            })
          )
          return Result.ok(output)
        }
      )

      // Verify SinglePayment subscription behavior
      const singlePaymentSub =
        singlePaymentCustomerResult.subscription!
      expect(singlePaymentSub.renews).toBe(false)
      expect(singlePaymentSub.currentBillingPeriodStart).toBeNull()
      expect(singlePaymentSub.currentBillingPeriodEnd).toBeNull()

      // Test 2: Customer with Subscription pricing model
      const subscriptionCustomerResult = await adminTransaction(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          const output = await createCustomerBookkeeping(
            {
              customer: {
                email: `test+${core.nanoid()}@example.com`,
                name: 'Customer with Subscription Model',
                organizationId: organization.id,
                externalId: `ext_${core.nanoid()}`,
                pricingModelId:
                  subscriptionPricingModel.unwrap().pricingModel.id,
              },
            },
            withAdminCacheContext({
              transaction,
              organizationId: organization.id,
              livemode: testLivemode,
              invalidateCache,
              emitEvent,
              enqueueLedgerCommand,
            })
          )
          return Result.ok(output)
        }
      )

      // Verify Subscription behavior
      const subscriptionSub = subscriptionCustomerResult.subscription!
      expect(subscriptionSub.renews).toBe(true)
      expect(typeof subscriptionSub.currentBillingPeriodStart).toBe(
        'number'
      )
      expect(
        subscriptionSub.currentBillingPeriodStart
      ).toBeGreaterThan(0)
      expect(typeof subscriptionSub.currentBillingPeriodEnd).toBe(
        'number'
      )
      expect(subscriptionSub.currentBillingPeriodEnd).toBeGreaterThan(
        subscriptionSub.currentBillingPeriodStart!
      )

      // Verify billing periods
      const singlePaymentBillingPeriods = await adminTransaction(
        async ({ transaction }) => {
          return selectBillingPeriods(
            { subscriptionId: singlePaymentSub.id },
            transaction
          )
        }
      )
      expect(singlePaymentBillingPeriods).toHaveLength(0)

      const subscriptionBillingPeriods = await adminTransaction(
        async ({ transaction }) => {
          return selectBillingPeriods(
            { subscriptionId: subscriptionSub.id },
            transaction
          )
        }
      )
      expect(subscriptionBillingPeriods).toHaveLength(1)
    })
  })
})

describe('createPricingModelBookkeeping', () => {
  let organizationId: string
  const livemode = false

  beforeEach(async () => {
    // Set up a basic organization
    const { organization } = (await setupOrg()).unwrap()
    organizationId = organization.id
  })

  describe('pricing model creation with automatic default product', () => {
    it('should create a pricing model with a default product and single payment price when no interval unit is provided', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          const output = await createPricingModelBookkeeping(
            {
              pricingModel: {
                name: 'New Pricing Model',
                isDefault: false,
              },
            },
            withDiscardingEffectsContext({
              transaction,
              organizationId,
              livemode,
            })
          )
          return output
        }
      )

      const unwrapped = result.unwrap()

      // Verify the pricing model was created
      expect(unwrapped.pricingModel).toMatchObject({})
      expect(unwrapped.pricingModel.name).toBe('New Pricing Model')
      expect(unwrapped.pricingModel.isDefault).toBe(false)
      expect(unwrapped.pricingModel.organizationId).toBe(
        organizationId
      )
      expect(unwrapped.pricingModel.livemode).toBe(livemode)

      // Verify the default product was created
      expect(unwrapped.defaultProduct).toMatchObject({})
      expect(unwrapped.defaultProduct.name).toBe('Free Plan')
      expect(unwrapped.defaultProduct.slug).toBe('free')
      expect(unwrapped.defaultProduct.default).toBe(true)
      expect(unwrapped.defaultProduct.pricingModelId).toBe(
        unwrapped.pricingModel.id
      )
      expect(unwrapped.defaultProduct.organizationId).toBe(
        organizationId
      )
      expect(unwrapped.defaultProduct.livemode).toBe(livemode)
      expect(unwrapped.defaultProduct.active).toBe(true)

      // Verify the default price was created
      expect(unwrapped.defaultPrice).toMatchObject({})
      expect(unwrapped.defaultPrice.productId).toBe(
        unwrapped.defaultProduct.id
      )
      expect(unwrapped.defaultPrice.unitPrice).toBe(0)
      expect(unwrapped.defaultPrice.isDefault).toBe(true)
      expect(unwrapped.defaultPrice.type).toBe(
        PriceType.SinglePayment
      )
      expect(unwrapped.defaultPrice.intervalUnit).toBe(null)
      expect(unwrapped.defaultPrice.intervalCount).toBe(null)
      expect(unwrapped.defaultPrice.livemode).toBe(livemode)
      expect(unwrapped.defaultPrice.active).toBe(true)
      expect(unwrapped.defaultPrice.name).toBe('Free Plan')
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
            withDiscardingEffectsContext({
              transaction,
              organizationId,
              livemode,
            })
          )
          return output
        }
      )

      const unwrapped = result.unwrap()

      // Verify the pricing model is not marked as default (since one already exists)
      expect(unwrapped.pricingModel.isDefault).toBe(false)

      // Verify the default product and price were still created
      expect(unwrapped.defaultProduct.default).toBe(true)
      expect(unwrapped.defaultPrice.unitPrice).toBe(0)
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
            withDiscardingEffectsContext({
              transaction,
              organizationId,
              livemode,
            })
          )
          return output
        }
      )

      // Verify the price uses the organization's default currency
      expect(result.unwrap().defaultPrice.currency).toBe(
        CurrencyCode.USD
      )
    })
  })

  describe('default pricing model handling', () => {
    it('should create a new default pricing model and update the previous default to non-default', async () => {
      // First, verify we have an existing default pricing model from setupOrg
      const existingDefaultPricingModel = await adminTransaction(
        async ({ transaction }) => {
          const defaultPM = await selectDefaultPricingModel(
            { organizationId, livemode },
            transaction
          )
          return defaultPM
        }
      )
      expect(existingDefaultPricingModel).toMatchObject({
        isDefault: true,
      })
      expect(existingDefaultPricingModel?.isDefault).toBe(true)
      const existingDefaultId = existingDefaultPricingModel!.id

      // Create a new pricing model with isDefault: true
      const result = await adminTransaction(
        async ({ transaction }) => {
          const output = await createPricingModelBookkeeping(
            {
              pricingModel: {
                name: 'New Default Pricing Model',
                isDefault: true,
              },
            },
            withDiscardingEffectsContext({
              transaction,
              organizationId,
              livemode,
            })
          )
          return output
        }
      )

      const unwrapped = result.unwrap()

      // Verify the new pricing model is created and is default
      expect(unwrapped.pricingModel).toMatchObject({})
      expect(unwrapped.pricingModel.name).toBe(
        'New Default Pricing Model'
      )
      expect(unwrapped.pricingModel.isDefault).toBe(true)

      // Verify the previous default pricing model is no longer default
      const previousDefaultPricingModel = await adminTransaction(
        async ({ transaction }) => {
          const prevDefaultPM = (
            await selectPricingModelById(
              existingDefaultId,
              transaction
            )
          ).unwrap()
          return prevDefaultPM
        }
      )
      expect(previousDefaultPricingModel.isDefault).toBe(false)

      // Verify there's only one default pricing model for the organization
      const allPricingModels = await adminTransaction(
        async ({ transaction }) => {
          const pricingModels = await selectPricingModels(
            { organizationId, livemode },
            transaction
          )
          return pricingModels
        }
      )
      const defaultPricingModels = allPricingModels.filter(
        (pm) => pm.isDefault
      )
      expect(defaultPricingModels).toHaveLength(1)
      expect(defaultPricingModels[0].id).toBe(
        unwrapped.pricingModel.id
      )
    })

    it('should not affect default pricing models across livemode boundaries', async () => {
      // Get the existing live mode default (from setupOrg)
      const liveModeDefaultPricingModel = await adminTransaction(
        async ({ transaction }) => {
          const defaultPM = await selectDefaultPricingModel(
            { organizationId, livemode: true },
            transaction
          )
          return defaultPM
        }
      )

      // First, create a test mode (livemode: false) default pricing model
      const testModeDefaultPricingModel = await adminTransaction(
        async ({ transaction }) => {
          const output = await createPricingModelBookkeeping(
            {
              pricingModel: {
                name: 'Test Mode Default Pricing Model',
                isDefault: true,
              },
            },
            withDiscardingEffectsContext({
              transaction,
              organizationId,
              livemode: false,
            })
          )
          return output.unwrap().pricingModel
        }
      )

      // Verify we have two defaults - one for each livemode
      expect(testModeDefaultPricingModel.isDefault).toBe(true)
      expect(testModeDefaultPricingModel.livemode).toBe(false)
      expect(liveModeDefaultPricingModel).toMatchObject({
        isDefault: true,
      })
      expect(liveModeDefaultPricingModel?.isDefault).toBe(true)
      expect(liveModeDefaultPricingModel?.livemode).toBe(true)

      // Create a new test mode default pricing model - this should change the testmode default
      // but NOT affect the livemode default
      const newTestModeDefault = await adminTransaction(
        async ({ transaction }) => {
          const output = await createPricingModelBookkeeping(
            {
              pricingModel: {
                name: 'New Test Mode Default Pricing Model',
                isDefault: true,
              },
            },
            withDiscardingEffectsContext({
              transaction,
              organizationId,
              livemode: false,
            })
          )
          return output.unwrap().pricingModel
        }
      )

      // Verify the new test mode pricing model is default
      expect(newTestModeDefault.isDefault).toBe(true)
      expect(newTestModeDefault.livemode).toBe(false)

      // Check that the livemode default is STILL the default (unaffected by testmode changes)
      const refreshedLiveModeDefault = await adminTransaction(
        async ({ transaction }) => {
          const pm = (
            await selectPricingModelById(
              liveModeDefaultPricingModel!.id,
              transaction
            )
          ).unwrap()
          return pm
        }
      )
      expect(refreshedLiveModeDefault.isDefault).toBe(true)
      expect(refreshedLiveModeDefault.livemode).toBe(true)

      // Check that the old test mode default is no longer default
      const refreshedOldTestModeDefault = await adminTransaction(
        async ({ transaction }) => {
          const pm = (
            await selectPricingModelById(
              testModeDefaultPricingModel.id,
              transaction
            )
          ).unwrap()
          return pm
        }
      )
      expect(refreshedOldTestModeDefault.isDefault).toBe(false)
      expect(refreshedOldTestModeDefault.livemode).toBe(false)

      // Verify we still have exactly one default per livemode
      const allPricingModels = await adminTransaction(
        async ({ transaction }) => {
          const pricingModels = await selectPricingModels(
            { organizationId },
            transaction
          )
          return pricingModels
        }
      )

      const liveDefaults = allPricingModels.filter(
        (pm) => pm.livemode && pm.isDefault
      )
      const testDefaults = allPricingModels.filter(
        (pm) => !pm.livemode && pm.isDefault
      )

      expect(liveDefaults).toHaveLength(1)
      expect(liveDefaults[0].id).toBe(liveModeDefaultPricingModel!.id)
      expect(testDefaults).toHaveLength(1)
      expect(testDefaults[0].id).toBe(newTestModeDefault.id)
    })
  })

  describe('currency handling for different organizations', () => {
    it('should create pricing model with EUR currency for European organization', async () => {
      // Create an organization with EUR as default currency
      const eurOrganization = await adminTransaction(
        async ({ transaction }) => {
          const [country] = await selectCountries(
            { code: 'US' },
            transaction
          )
          const org = await insertOrganization(
            {
              name: `EUR Org ${core.nanoid()}`,
              defaultCurrency: CurrencyCode.EUR,
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

      // Create a pricing model for the EUR organization
      const result = await adminTransaction(
        async ({ transaction }) => {
          const output = await createPricingModelBookkeeping(
            {
              pricingModel: {
                name: 'EUR Pricing Model',
                isDefault: true,
              },
            },
            withDiscardingEffectsContext({
              transaction,
              organizationId: eurOrganization.id,
              livemode,
            })
          )
          return output
        }
      )

      const unwrapped = result.unwrap()

      // Verify the default price uses EUR currency
      expect(unwrapped.defaultPrice.currency).toBe(CurrencyCode.EUR)
      expect(unwrapped.pricingModel.organizationId).toBe(
        eurOrganization.id
      )
    })

    it('should create pricing model with GBP currency for UK organization', async () => {
      // Create an organization with GBP as default currency
      const gbpOrganization = await adminTransaction(
        async ({ transaction }) => {
          const [country] = await selectCountries(
            { code: 'US' },
            transaction
          )
          const org = await insertOrganization(
            {
              name: `GBP Org ${core.nanoid()}`,
              defaultCurrency: CurrencyCode.GBP,
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

      // Create a pricing model for the GBP organization
      const result = await adminTransaction(
        async ({ transaction }) => {
          const output = await createPricingModelBookkeeping(
            {
              pricingModel: {
                name: 'GBP Pricing Model',
                isDefault: true,
              },
            },
            withDiscardingEffectsContext({
              transaction,
              organizationId: gbpOrganization.id,
              livemode,
            })
          )
          return output
        }
      )

      const unwrapped = result.unwrap()

      // Verify the default price uses GBP currency
      expect(unwrapped.defaultPrice.currency).toBe(CurrencyCode.GBP)
      expect(unwrapped.pricingModel.organizationId).toBe(
        gbpOrganization.id
      )
    })
  })

  describe('default product and price attributes validation', () => {
    it('should create default product with all correct attributes', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          const output = await createPricingModelBookkeeping(
            {
              pricingModel: {
                name: 'Test Attributes Pricing Model',
                isDefault: false,
              },
            },
            withDiscardingEffectsContext({
              transaction,
              organizationId,
              livemode,
            })
          )
          return output
        }
      )

      const unwrapped = result.unwrap()

      // Verify all default product attributes
      const defaultProduct = unwrapped.defaultProduct
      expect(defaultProduct.name).toBe('Free Plan')
      expect(defaultProduct.slug).toBe('free')
      expect(defaultProduct.default).toBe(true)
      expect(defaultProduct.description).toBe('Default plan')
      expect(defaultProduct.pricingModelId).toBe(
        unwrapped.pricingModel.id
      )
      expect(defaultProduct.organizationId).toBe(organizationId)
      expect(defaultProduct.livemode).toBe(livemode)
      expect(defaultProduct.active).toBe(true)
      expect(defaultProduct.singularQuantityLabel).toBeNull()
      expect(defaultProduct.pluralQuantityLabel).toBeNull()
      expect(defaultProduct.imageURL).toBeNull()
      expect(defaultProduct.externalId).toBeNull()
    })

    it('should create default price with all correct attributes', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          const output = await createPricingModelBookkeeping(
            {
              pricingModel: {
                name: 'Test Price Attributes Pricing Model',
                isDefault: false,
              },
            },
            withDiscardingEffectsContext({
              transaction,
              organizationId,
              livemode,
            })
          )
          return output
        }
      )

      const unwrapped = result.unwrap()

      // Verify all default price attributes
      const defaultPrice = unwrapped.defaultPrice
      expect(defaultPrice.productId).toBe(unwrapped.defaultProduct.id)
      expect(defaultPrice.unitPrice).toBe(0)
      expect(defaultPrice.isDefault).toBe(true)
      /**
       * If defaultPlanIntervalUnit is not provided,
       * the default price should be a single payment price
       */
      expect(defaultPrice.type).toBe(PriceType.SinglePayment)
      expect(defaultPrice.intervalUnit).toBeNull()
      expect(defaultPrice.intervalCount).toBeNull()
      expect(defaultPrice.currency).toBe(CurrencyCode.USD)
      expect(defaultPrice.livemode).toBe(livemode)
      expect(defaultPrice.active).toBe(true)
      expect(defaultPrice.name).toBe('Free Plan')
      expect(defaultPrice.trialPeriodDays).toBeNull()
      expect(defaultPrice.usageEventsPerUnit).toBeNull()
      expect(defaultPrice.usageMeterId).toBeNull()
      expect(defaultPrice.externalId).toBeNull()
      expect(defaultPrice.slug).toBe('free')
    })

    it('should inherit livemode from pricing model to product and price', async () => {
      // Test with livemode: false
      const testLivemode = false
      const testOrganization = await adminTransaction(
        async ({ transaction }) => {
          const [country] = await selectCountries(
            { code: 'US' },
            transaction
          )
          const org = await insertOrganization(
            {
              name: `Test Livemode Org ${core.nanoid()}`,
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

      const result = await adminTransaction(
        async ({ transaction }) => {
          const output = await createPricingModelBookkeeping(
            {
              pricingModel: {
                name: 'Test Livemode Pricing Model',
                isDefault: true,
              },
            },
            withDiscardingEffectsContext({
              transaction,
              organizationId: testOrganization.id,
              livemode: testLivemode,
            })
          )
          return output
        }
      )

      const unwrapped = result.unwrap()

      // Verify livemode is propagated correctly
      expect(unwrapped.pricingModel.livemode).toBe(testLivemode)
      expect(unwrapped.defaultProduct.livemode).toBe(testLivemode)
      expect(unwrapped.defaultPrice.livemode).toBe(testLivemode)
    })
  })

  describe('default price type behavior based on interval unit', () => {
    describe('when defaultPlanIntervalUnit IS provided', () => {
      it('should create a subscription price with Month interval when Month is provided', async () => {
        const result = await adminTransaction(
          async ({ transaction }) => {
            const output = await createPricingModelBookkeeping(
              {
                pricingModel: {
                  name: 'Monthly Subscription Pricing Model',
                  isDefault: false,
                },
                defaultPlanIntervalUnit: IntervalUnit.Month,
              },
              withDiscardingEffectsContext({
                transaction,
                organizationId,
                livemode,
              })
            )
            return output
          }
        )

        const unwrapped = result.unwrap()

        // Verify the default price is a subscription with Month interval
        expect(unwrapped.defaultPrice.type).toBe(
          PriceType.Subscription
        )
        expect(unwrapped.defaultPrice.intervalUnit).toBe(
          IntervalUnit.Month
        )
        expect(unwrapped.defaultPrice.intervalCount).toBe(1)
        expect(unwrapped.defaultPrice.unitPrice).toBe(0)
        // Additional checks for subscription-specific fields
        expect(unwrapped.defaultPrice.name).toBe('Free Plan')
        expect(unwrapped.defaultPrice.isDefault).toBe(true)
        expect(unwrapped.defaultPrice.active).toBe(true)
      })

      it('should create a subscription price with Year interval when Year is provided', async () => {
        const result = await adminTransaction(
          async ({ transaction }) => {
            const output = await createPricingModelBookkeeping(
              {
                pricingModel: {
                  name: 'Yearly Subscription Pricing Model',
                  isDefault: false,
                },
                defaultPlanIntervalUnit: IntervalUnit.Year,
              },
              withDiscardingEffectsContext({
                transaction,
                organizationId,
                livemode,
              })
            )
            return output
          }
        )

        const unwrapped = result.unwrap()

        // Verify the default price is a subscription with year interval
        expect(unwrapped.defaultPrice.type).toBe(
          PriceType.Subscription
        )
        expect(unwrapped.defaultPrice.intervalUnit).toBe(
          IntervalUnit.Year
        )
        expect(unwrapped.defaultPrice.intervalCount).toBe(1)
        expect(unwrapped.defaultPrice.unitPrice).toBe(0)
      })

      it('should create a subscription price with Week interval when Week is provided', async () => {
        const result = await adminTransaction(
          async ({ transaction }) => {
            const output = await createPricingModelBookkeeping(
              {
                pricingModel: {
                  name: 'Weekly Subscription Pricing Model',
                  isDefault: false,
                },
                defaultPlanIntervalUnit: IntervalUnit.Week,
              },
              withDiscardingEffectsContext({
                transaction,
                organizationId,
                livemode,
              })
            )
            return output
          }
        )

        // Verify the default price is a subscription with Week interval
        expect(result.unwrap().defaultPrice.type).toBe(
          PriceType.Subscription
        )
        expect(result.unwrap().defaultPrice.intervalUnit).toBe(
          IntervalUnit.Week
        )
        expect(result.unwrap().defaultPrice.intervalCount).toBe(1)
        expect(result.unwrap().defaultPrice.unitPrice).toBe(0)
      })

      it('should create a subscription price with Day interval when Day is provided', async () => {
        const result = await adminTransaction(
          async ({ transaction }) => {
            const output = await createPricingModelBookkeeping(
              {
                pricingModel: {
                  name: 'Daily Subscription Pricing Model',
                  isDefault: false,
                },
                defaultPlanIntervalUnit: IntervalUnit.Day,
              },
              withDiscardingEffectsContext({
                transaction,
                organizationId,
                livemode,
              })
            )
            return output
          }
        )

        // Verify the default price is a subscription with Day interval
        expect(result.unwrap().defaultPrice.type).toBe(
          PriceType.Subscription
        )
        expect(result.unwrap().defaultPrice.intervalUnit).toBe(
          IntervalUnit.Day
        )
        expect(result.unwrap().defaultPrice.intervalCount).toBe(1)
        expect(result.unwrap().defaultPrice.unitPrice).toBe(0)
      })

      it('should always set intervalCount to 1 for subscription prices', async () => {
        // Test that intervalCount is always 1 regardless of interval unit
        const intervalUnits = [
          IntervalUnit.Day,
          IntervalUnit.Week,
          IntervalUnit.Month,
          IntervalUnit.Year,
        ]

        for (const intervalUnit of intervalUnits) {
          const result = await adminTransaction(
            async ({ transaction }) => {
              const output = await createPricingModelBookkeeping(
                {
                  pricingModel: {
                    name: `${intervalUnit} Test Pricing Model`,
                    isDefault: false,
                  },
                  defaultPlanIntervalUnit: intervalUnit,
                },
                withDiscardingEffectsContext({
                  transaction,
                  organizationId,
                  livemode,
                })
              )
              return output
            }
          )

          // Verify intervalCount is always 1
          expect(result.unwrap().defaultPrice.intervalCount).toBe(1)
          expect(result.unwrap().defaultPrice.intervalCount).not.toBe(
            2
          )
          expect(result.unwrap().defaultPrice.intervalCount).not.toBe(
            0
          )
          expect(
            typeof result.unwrap().defaultPrice.intervalCount
          ).toBe('number')
        }
      })
    })

    describe('when defaultPlanIntervalUnit is NOT provided', () => {
      it('should create a single payment price by default', async () => {
        const result = await adminTransaction(
          async ({ transaction }) => {
            const output = await createPricingModelBookkeeping(
              {
                pricingModel: {
                  name: 'Single Payment Pricing Model',
                  isDefault: false,
                },
                // No defaultPlanIntervalUnit provided
              },
              withDiscardingEffectsContext({
                transaction,
                organizationId,
                livemode,
              })
            )
            return output
          }
        )

        // Verify the default price is a single payment
        expect(result.unwrap().defaultPrice.type).toBe(
          PriceType.SinglePayment
        )
        expect(result.unwrap().defaultPrice.intervalUnit).toBeNull()
        expect(result.unwrap().defaultPrice.intervalCount).toBeNull()
        expect(result.unwrap().defaultPrice.unitPrice).toBe(0)
      })
    })

    it('should support all IntervalUnit enum values', async () => {
      const intervalUnits = [
        IntervalUnit.Day,
        IntervalUnit.Week,
        IntervalUnit.Month,
        IntervalUnit.Year,
      ]

      for (const intervalUnit of intervalUnits) {
        const result = await adminTransaction(
          async ({ transaction }) => {
            const output = await createPricingModelBookkeeping(
              {
                pricingModel: {
                  name: `${intervalUnit} Interval Pricing Model`,
                  isDefault: false,
                },
                defaultPlanIntervalUnit: intervalUnit,
              },
              withDiscardingEffectsContext({
                transaction,
                organizationId,
                livemode,
              })
            )
            return output
          }
        )

        // Verify the correct interval unit is set
        expect(result.unwrap().defaultPrice.type).toBe(
          PriceType.Subscription
        )
        expect(result.unwrap().defaultPrice.intervalUnit).toBe(
          intervalUnit
        )
        expect(result.unwrap().defaultPrice.intervalCount).toBe(1)
      }
    })
  })
})

describe('createFreePlanPriceInsert', () => {
  let defaultProduct: Product.Record
  const defaultCurrency = CurrencyCode.USD

  beforeEach(async () => {
    // Set up a basic organization and product for testing
    const { product } = (await setupOrg()).unwrap()
    defaultProduct = product
  })

  describe('basic functionality', () => {
    it('should create a single payment price when no interval unit is provided', () => {
      const result = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency
      )

      expect(result).toMatchObject({})
      expect(result.productId).toBe(defaultProduct.id)
      expect(result.unitPrice).toBe(0)
      expect(result.isDefault).toBe(true)
      expect(result.type).toBe(PriceType.SinglePayment)
      expect(result.intervalUnit).toBeNull()
      expect(result.intervalCount).toBeNull()
      expect(result.currency).toBe(defaultCurrency)
      expect(result.livemode).toBe(defaultProduct.livemode)
      expect(result.active).toBe(true)
      expect(result.name).toBe('Free Plan')
      expect(result.trialPeriodDays).toBeNull()
      expect(result.usageEventsPerUnit).toBeNull()
      expect(result.usageMeterId).toBeNull()
      expect(result.externalId).toBeNull()
      expect(result.slug).toBe('free')
    })

    it('should create a subscription price when interval unit is provided', () => {
      const result = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency,
        IntervalUnit.Month
      )

      expect(result).toMatchObject({})
      expect(result.productId).toBe(defaultProduct.id)
      expect(result.unitPrice).toBe(0)
      expect(result.isDefault).toBe(true)
      expect(result.type).toBe(PriceType.Subscription)
      expect(result.intervalUnit).toBe(IntervalUnit.Month)
      expect(result.intervalCount).toBe(1)
      expect(result.currency).toBe(defaultCurrency)
      expect(result.livemode).toBe(defaultProduct.livemode)
      expect(result.active).toBe(true)
      expect(result.name).toBe('Free Plan')
      expect(result.trialPeriodDays).toBeNull()
      expect(result.usageEventsPerUnit).toBeNull()
      expect(result.usageMeterId).toBeNull()
      expect(result.externalId).toBeNull()
      expect(result.slug).toBe('free')
    })
  })

  describe('different interval units', () => {
    it('should create subscription price with Day interval', () => {
      const result = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency,
        IntervalUnit.Day
      )

      expect(result.type).toBe(PriceType.Subscription)
      expect(result.intervalUnit).toBe(IntervalUnit.Day)
      expect(result.intervalCount).toBe(1)
    })

    it('should create subscription price with Week interval', () => {
      const result = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency,
        IntervalUnit.Week
      )

      expect(result.type).toBe(PriceType.Subscription)
      expect(result.intervalUnit).toBe(IntervalUnit.Week)
      expect(result.intervalCount).toBe(1)
    })

    it('should create subscription price with Month interval', () => {
      const result = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency,
        IntervalUnit.Month
      )

      expect(result.type).toBe(PriceType.Subscription)
      expect(result.intervalUnit).toBe(IntervalUnit.Month)
      expect(result.intervalCount).toBe(1)
    })

    it('should create subscription price with Year interval', () => {
      const result = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency,
        IntervalUnit.Year
      )

      expect(result.type).toBe(PriceType.Subscription)
      expect(result.intervalUnit).toBe(IntervalUnit.Year)
      expect(result.intervalCount).toBe(1)
    })
  })

  describe('different currencies', () => {
    it('should work with USD currency', () => {
      const result = createFreePlanPriceInsert(
        defaultProduct,
        CurrencyCode.USD
      )

      expect(result.currency).toBe(CurrencyCode.USD)
    })

    it('should work with EUR currency', () => {
      const result = createFreePlanPriceInsert(
        defaultProduct,
        CurrencyCode.EUR
      )

      expect(result.currency).toBe(CurrencyCode.EUR)
    })

    it('should work with GBP currency', () => {
      const result = createFreePlanPriceInsert(
        defaultProduct,
        CurrencyCode.GBP
      )

      expect(result.currency).toBe(CurrencyCode.GBP)
    })

    it('should work with CAD currency', () => {
      const result = createFreePlanPriceInsert(
        defaultProduct,
        CurrencyCode.CAD
      )

      expect(result.currency).toBe(CurrencyCode.CAD)
    })
  })

  describe('product inheritance', () => {
    it('should inherit product ID correctly', () => {
      const result = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency
      )

      expect(result.productId).toBe(defaultProduct.id)
    })

    it('should inherit livemode from product', () => {
      const result = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency
      )

      expect(result.livemode).toBe(defaultProduct.livemode)
    })
  })

  describe('default values verification', () => {
    it('should always set unitPrice to 0', () => {
      const singlePaymentResult = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency
      )
      const subscriptionResult = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency,
        IntervalUnit.Month
      )

      expect(singlePaymentResult.unitPrice).toBe(0)
      expect(subscriptionResult.unitPrice).toBe(0)
    })

    it('should always set isDefault to true', () => {
      const singlePaymentResult = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency
      )
      const subscriptionResult = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency,
        IntervalUnit.Month
      )

      expect(singlePaymentResult.isDefault).toBe(true)
      expect(subscriptionResult.isDefault).toBe(true)
    })

    it('should always set active to true', () => {
      const singlePaymentResult = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency
      )
      const subscriptionResult = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency,
        IntervalUnit.Month
      )

      expect(singlePaymentResult.active).toBe(true)
      expect(subscriptionResult.active).toBe(true)
    })

    it('should always set name to "Free Plan"', () => {
      const singlePaymentResult = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency
      )
      const subscriptionResult = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency,
        IntervalUnit.Month
      )

      expect(singlePaymentResult.name).toBe('Free Plan')
      expect(subscriptionResult.name).toBe('Free Plan')
    })

    it('should always set slug to "free"', () => {
      const singlePaymentResult = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency
      )
      const subscriptionResult = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency,
        IntervalUnit.Month
      )

      expect(singlePaymentResult.slug).toBe('free')
      expect(subscriptionResult.slug).toBe('free')
    })
  })

  describe('subscription vs single payment differences', () => {
    it('should set interval fields correctly for subscription prices', () => {
      const result = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency,
        IntervalUnit.Month
      )

      expect(result.intervalUnit).toBe(IntervalUnit.Month)
      expect(result.intervalCount).toBe(1)
    })

    it('should set interval fields to null for single payment prices', () => {
      const result = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency
      )

      expect(result.intervalUnit).toBeNull()
      expect(result.intervalCount).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('should handle undefined interval unit parameter', () => {
      const result = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency,
        undefined
      )

      expect(result.type).toBe(PriceType.SinglePayment)
      expect(result.intervalUnit).toBeNull()
      expect(result.intervalCount).toBeNull()
    })

    it('should handle null interval unit parameter', () => {
      const result = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency,
        null as any
      )

      expect(result.type).toBe(PriceType.SinglePayment)
      expect(result.intervalUnit).toBeNull()
      expect(result.intervalCount).toBeNull()
    })
  })

  describe('return type validation', () => {
    it('should return a valid Price.Insert object for single payment', () => {
      const result = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency
      )

      // Check that all required fields have expected values
      expect(result.productId).toBe(defaultProduct.id)
      expect(result.unitPrice).toBe(0)
      expect(result.isDefault).toBe(true)
      expect(result.type).toBe(PriceType.SinglePayment)
      expect(result.currency).toBe(defaultCurrency)
      expect(result.livemode).toBe(defaultProduct.livemode)
      expect(result.active).toBe(true)
      expect(result.name).toBe('Free Plan')
      expect(result.slug).toBe('free')
    })

    it('should return a valid Price.Insert object for subscription', () => {
      const result = createFreePlanPriceInsert(
        defaultProduct,
        defaultCurrency,
        IntervalUnit.Month
      )

      // Check that all required fields have expected values
      expect(result.productId).toBe(defaultProduct.id)
      expect(result.unitPrice).toBe(0)
      expect(result.isDefault).toBe(true)
      expect(result.type).toBe(PriceType.Subscription)
      expect(result.currency).toBe(defaultCurrency)
      expect(result.livemode).toBe(defaultProduct.livemode)
      expect(result.active).toBe(true)
      expect(result.name).toBe('Free Plan')
      expect(result.slug).toBe('free')
      expect(result.intervalUnit).toBe(IntervalUnit.Month)
      expect(result.intervalCount).toBe(1)
    })
  })
})

describe('updatePurchaseStatusToReflectLatestPayment', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let purchase: Purchase.Record
  let invoice: Invoice.Record

  beforeEach(async () => {
    const orgData = (await setupOrg()).unwrap()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      unitPrice: 1000,
      type: PriceType.SinglePayment,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
    })

    customer = (
      await setupCustomer({
        organizationId: organization.id,
        email: `test+${core.nanoid()}@test.com`,
        livemode: true,
      })
    ).unwrap()

    purchase = (
      await setupPurchase({
        customerId: customer.id,
        organizationId: organization.id,
        livemode: true,
        priceId: price.id,
        status: PurchaseStatus.Open,
      })
    ).unwrap()

    invoice = await setupInvoice({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      status: InvoiceStatus.Draft,
      purchaseId: purchase.id,
    })
  })

  it('should update purchase status to Paid when payment status is Succeeded', async () => {
    const payment = await setupPayment({
      stripeChargeId: `ch_${core.nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 1000,
      livemode: true,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: invoice.id,
      purchaseId: purchase.id,
      chargeDate: Date.now(),
    })

    await adminTransaction(
      async ({
        transaction,
        cacheRecomputationContext,
        invalidateCache,
        emitEvent,
        enqueueLedgerCommand,
      }) => {
        await updatePurchaseStatusToReflectLatestPayment(payment, {
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        })

        // Verify purchase status was updated to Paid
        const updatedPurchase = (
          await selectPurchaseById(purchase.id, transaction)
        ).unwrap()
        expect(updatedPurchase.status).toBe(PurchaseStatus.Paid)
        expect(updatedPurchase.purchaseDate).toBe(payment.chargeDate)
        return Result.ok(null)
      }
    )
  })

  it('should update purchase status to Failed when payment status is Canceled', async () => {
    const payment = await setupPayment({
      stripeChargeId: `ch_${core.nanoid()}`,
      status: PaymentStatus.Canceled,
      amount: 1000,
      livemode: true,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: invoice.id,
      purchaseId: purchase.id,
      chargeDate: Date.now(),
    })

    await adminTransaction(
      async ({
        transaction,
        cacheRecomputationContext,
        invalidateCache,
        emitEvent,
        enqueueLedgerCommand,
      }) => {
        await updatePurchaseStatusToReflectLatestPayment(payment, {
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        })

        // Verify purchase status was updated to Failed
        const updatedPurchase = (
          await selectPurchaseById(purchase.id, transaction)
        ).unwrap()
        expect(updatedPurchase.status).toBe(PurchaseStatus.Failed)
        return Result.ok(null)
      }
    )
  })

  it('should update purchase status to Pending when payment status is Processing', async () => {
    const payment = await setupPayment({
      stripeChargeId: `ch_${core.nanoid()}`,
      status: PaymentStatus.Processing,
      amount: 1000,
      livemode: true,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: invoice.id,
      purchaseId: purchase.id,
      chargeDate: Date.now(),
    })

    await adminTransaction(
      async ({
        transaction,
        cacheRecomputationContext,
        invalidateCache,
        emitEvent,
        enqueueLedgerCommand,
      }) => {
        await updatePurchaseStatusToReflectLatestPayment(payment, {
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        })

        // Verify purchase status was updated to Pending
        const updatedPurchase = (
          await selectPurchaseById(purchase.id, transaction)
        ).unwrap()
        expect(updatedPurchase.status).toBe(PurchaseStatus.Pending)
        return Result.ok(null)
      }
    )
  })

  it('should not update any purchase when payment has no purchaseId', async () => {
    // Create a payment without a purchaseId
    const paymentWithoutPurchase = await setupPayment({
      stripeChargeId: `ch_${core.nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 1000,
      livemode: true,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: invoice.id,
      // No purchaseId
      chargeDate: Date.now(),
    })

    await adminTransaction(
      async ({
        transaction,
        cacheRecomputationContext,
        invalidateCache,
        emitEvent,
        enqueueLedgerCommand,
      }) => {
        await updatePurchaseStatusToReflectLatestPayment(
          paymentWithoutPurchase,
          {
            transaction,
            cacheRecomputationContext,
            invalidateCache,
            emitEvent,
            enqueueLedgerCommand,
          }
        )

        // Verify purchase status was NOT updated (should remain Open)
        const unchangedPurchase = (
          await selectPurchaseById(purchase.id, transaction)
        ).unwrap()
        expect(unchangedPurchase.status).toBe(PurchaseStatus.Open)
        return Result.ok(null)
      }
    )
  })
})

describe('updateInvoiceStatusToReflectLatestPayment', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let invoice: Invoice.Record

  beforeEach(async () => {
    const orgData = (await setupOrg()).unwrap()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      unitPrice: 1000,
      type: PriceType.SinglePayment,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
    })

    customer = (
      await setupCustomer({
        organizationId: organization.id,
        email: `test+${core.nanoid()}@test.com`,
        livemode: true,
      })
    ).unwrap()

    invoice = await setupInvoice({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      status: InvoiceStatus.Draft,
    })
  })

  it('should update invoice to Paid when total payments meet invoice total', async () => {
    const payment = await setupPayment({
      stripeChargeId: `ch_${core.nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 1000, // Matches the invoice line item price
      livemode: true,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: invoice.id,
      chargeDate: Date.now(),
    })

    await adminTransaction(
      async ({
        transaction,
        cacheRecomputationContext,
        invalidateCache,
        emitEvent,
        enqueueLedgerCommand,
      }) => {
        await updateInvoiceStatusToReflectLatestPayment(payment, {
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        })

        // Verify invoice status was updated to Paid
        const updatedInvoice = (
          await selectInvoiceById(invoice.id, transaction)
        ).unwrap()
        expect(updatedInvoice.status).toBe(InvoiceStatus.Paid)
        return Result.ok(null)
      }
    )
  })

  it('should not update invoice when payment status is not Succeeded', async () => {
    const payment = await setupPayment({
      stripeChargeId: `ch_${core.nanoid()}`,
      status: PaymentStatus.Processing,
      amount: 1000,
      livemode: true,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: invoice.id,
      chargeDate: Date.now(),
    })

    await adminTransaction(
      async ({
        transaction,
        cacheRecomputationContext,
        invalidateCache,
        emitEvent,
        enqueueLedgerCommand,
      }) => {
        await updateInvoiceStatusToReflectLatestPayment(payment, {
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        })

        // Verify invoice status was NOT updated (should remain Draft)
        const unchangedInvoice = (
          await selectInvoiceById(invoice.id, transaction)
        ).unwrap()
        expect(unchangedInvoice.status).toBe(InvoiceStatus.Draft)
        return Result.ok(null)
      }
    )
  })

  it('should not update invoice when it is already Paid', async () => {
    // First, create an invoice with Paid status
    const paidInvoice = await setupInvoice({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      status: InvoiceStatus.Paid,
    })

    const payment = await setupPayment({
      stripeChargeId: `ch_${core.nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 1000,
      livemode: true,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: paidInvoice.id,
      chargeDate: Date.now(),
    })

    await adminTransaction(
      async ({
        transaction,
        cacheRecomputationContext,
        invalidateCache,
        emitEvent,
        enqueueLedgerCommand,
      }) => {
        await updateInvoiceStatusToReflectLatestPayment(payment, {
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        })

        // Verify invoice status is still Paid (no change)
        const unchangedInvoice = (
          await selectInvoiceById(paidInvoice.id, transaction)
        ).unwrap()
        expect(unchangedInvoice.status).toBe(InvoiceStatus.Paid)
        return Result.ok(null)
      }
    )
  })

  it('should not update invoice when total payments are less than invoice total', async () => {
    // Add another line item to increase the invoice total
    ;(
      await setupInvoiceLineItem({
        invoiceId: invoice.id,
        priceId: price.id,
        quantity: 1,
        price: 2000, // Additional 2000
        livemode: true,
      })
    ).unwrap()

    // Payment amount is less than total (1000 + 2000 = 3000)
    const partialPayment = await setupPayment({
      stripeChargeId: `ch_${core.nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 1000, // Only partial payment
      livemode: true,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: invoice.id,
      chargeDate: Date.now(),
    })

    await adminTransaction(
      async ({
        transaction,
        cacheRecomputationContext,
        invalidateCache,
        emitEvent,
        enqueueLedgerCommand,
      }) => {
        await updateInvoiceStatusToReflectLatestPayment(
          partialPayment,
          {
            transaction,
            cacheRecomputationContext,
            invalidateCache,
            emitEvent,
            enqueueLedgerCommand,
          }
        )

        // Verify invoice status was NOT updated (should remain Draft)
        const unchangedInvoice = (
          await selectInvoiceById(invoice.id, transaction)
        ).unwrap()
        expect(unchangedInvoice.status).toBe(InvoiceStatus.Draft)
        return Result.ok(null)
      }
    )
  })

  it('should update invoice to Paid when multiple payments cover the total', async () => {
    // Add another line item to increase the invoice total
    ;(
      await setupInvoiceLineItem({
        invoiceId: invoice.id,
        priceId: price.id,
        quantity: 1,
        price: 1000, // Additional 1000, total = 2000
        livemode: true,
      })
    ).unwrap()

    // First payment - partial
    await setupPayment({
      stripeChargeId: `ch_${core.nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 1000,
      livemode: true,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: invoice.id,
      chargeDate: Date.now(),
    })

    // Second payment - completes the total
    const secondPayment = await setupPayment({
      stripeChargeId: `ch_${core.nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 1000,
      livemode: true,
      customerId: customer.id,
      organizationId: organization.id,
      invoiceId: invoice.id,
      chargeDate: Date.now(),
    })

    await adminTransaction(
      async ({
        transaction,
        cacheRecomputationContext,
        invalidateCache,
        emitEvent,
        enqueueLedgerCommand,
      }) => {
        await updateInvoiceStatusToReflectLatestPayment(
          secondPayment,
          {
            transaction,
            cacheRecomputationContext,
            invalidateCache,
            emitEvent,
            enqueueLedgerCommand,
          }
        )

        // Verify invoice status was updated to Paid
        const updatedInvoice = (
          await selectInvoiceById(invoice.id, transaction)
        ).unwrap()
        expect(updatedInvoice.status).toBe(InvoiceStatus.Paid)
        return Result.ok(null)
      }
    )
  })
})
