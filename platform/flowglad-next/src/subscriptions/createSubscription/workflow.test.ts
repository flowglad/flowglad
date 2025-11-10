import { describe, it, expect, beforeEach } from 'vitest'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupSubscription,
  setupSubscriptionItem,
  setupBillingPeriod,
  setupBillingPeriodItem,
  setupUsageMeter,
  setupPrice,
  setupTestFeaturesAndProductFeatures,
  setupUsageCreditGrantFeature,
  setupProductFeature,
  setupDiscount,
  setupPurchase,
  setupDiscountRedemption,
  setupProduct,
} from '@/../seedDatabase'
import { createSubscriptionWorkflow } from './workflow'
import type {
  StandardCreateSubscriptionResult,
  NonRenewingCreateSubscriptionResult,
} from './types'
import { TransactionOutput } from '@/db/transactionEnhacementTypes'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  FeatureFlag,
  IntervalUnit,
  SubscriptionStatus,
  PriceType,
  CurrencyCode,
  FeatureType,
  FeatureUsageGrantFrequency,
  LedgerEntryType,
  DiscountAmountType,
  LedgerTransactionType,
} from '@/types'
import { Price } from '@/db/schema/prices'
import { updateSubscription } from '@/db/tableMethods/subscriptionMethods'
import { selectBillingPeriodItems } from '@/db/tableMethods/billingPeriodItemMethods'
import { core } from '@/utils/core'
import { selectLedgerAccounts } from '@/db/tableMethods/ledgerAccountMethods'
import { updatePrice } from '@/db/tableMethods/priceMethods'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { Customer } from '@/db/schema/customers'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { BillingRun } from '@/db/schema/billingRuns'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import {
  selectLedgerEntries,
  aggregateBalanceForLedgerAccountFromEntries,
} from '@/db/tableMethods/ledgerEntryMethods'
import { PricingModel } from '@/db/schema/pricingModels'
import { selectUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import {
  insertDiscountRedemption,
  selectDiscountRedemptionById,
} from '@/db/tableMethods/discountRedemptionMethods'
import { DiscountRedemption } from '@/db/schema/discountRedemptions'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import { insertPricingModel } from '@/db/tableMethods/pricingModelMethods'

describe('createSubscriptionWorkflow', async () => {
  let organization: Organization.Record
  let product: Product.Record
  let defaultPrice: Price.Record // Renamed from 'price' to avoid conflict if a test defines its own 'price'
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let subscriptionItems: SubscriptionItem.Record[]
  let billingPeriod: BillingPeriod.Record
  let billingRun: BillingRun.Record | null // Can be null

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    product = orgData.product
    defaultPrice = orgData.price

    customer = await setupCustomer({
      organizationId: organization.id,
    })
    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const stripeSetupIntentId = `setupintent_before_each_${core.nanoid()}`
    const workflowResult = await comprehensiveAdminTransaction(
      async ({ transaction }) => {
        return createSubscriptionWorkflow(
          {
            organization,
            product,
            price: defaultPrice,
            quantity: 1,
            livemode: true,
            startDate: new Date(),
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: paymentMethod,
            customer,
            stripeSetupIntentId,
            autoStart: true, // Ensures billingRun is created for the first test
          },
          transaction
        )
      }
    )
    subscription = workflowResult.subscription
    subscriptionItems = workflowResult.subscriptionItems
    if (!workflowResult.billingPeriod) {
      throw new Error('billingPeriod not found')
    }
    billingPeriod = workflowResult.billingPeriod
    if (!('billingRun' in workflowResult)) {
      throw new Error('billingRun not found')
    }
    billingRun = workflowResult.billingRun
  })

  it('creates a subscription with correct priced items, and billing run', async () => {
    expect(subscription).toBeDefined()
    expect(subscription.cancelScheduledAt).toBeNull()
    expect(subscription.canceledAt).toBeNull()
    expect(subscriptionItems.length).toBeGreaterThan(0)
    // Assuming the first item corresponds to the defaultPrice and quantity 1
    expect(
      subscriptionItems[0].unitPrice * subscriptionItems[0].quantity
    ).toBe(defaultPrice.unitPrice * 1)
    expect(billingPeriod.status).toBe(BillingPeriodStatus.Active)
    expect(billingRun).toBeDefined() // Check if defined first
    expect(billingRun?.status).toBe(BillingRunStatus.Scheduled)
  })

  it('throws an error if the customer already has an active subscription', async () => {
    // The subscription from beforeEach is already active due to autoStart: true
    // and defaultPaymentMethod being present.
    // We need to ensure its status is indeed Active if the test relies on it.
    await adminTransaction(async ({ transaction }) => {
      await updateSubscription(
        {
          id: subscription.id, // subscription from beforeEach
          status: SubscriptionStatus.Active, // ensure it is active
          renews: subscription.renews,
        },
        transaction
      )
    })

    const stripeSetupIntentIdNew = `setupintent_new_${core.nanoid()}`
    await expect(
      adminTransaction(async ({ transaction }) => {
        return createSubscriptionWorkflow(
          {
            organization, // from beforeEach
            product, // from beforeEach
            price: defaultPrice, // from beforeEach
            quantity: 1,
            livemode: true,
            startDate: new Date(),
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: paymentMethod, // from beforeEach
            customer, // IMPORTANT: Use the same customer from beforeEach
            stripeSetupIntentId: stripeSetupIntentIdNew, // New intent ID
            // autoStart behavior for the second subscription attempt can be default or true
          },
          transaction
        )
      })
    ).rejects.toThrow(
      `Customer ${customer.id} already has an active subscription`
    )
  })

  it('does not throw an error if creating a subscription for a customer with no active subscriptions, but past non-active subscriptions', async () => {
    // This test uses its own customer and payment method, independent of beforeEach
    const newCustomer = await setupCustomer({
      organizationId: organization.id, // Use org from beforeEach for consistency
    })
    const newPaymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: newCustomer.id,
    })

    // Create a past subscription that is now canceled for newCustomer
    await adminTransaction(async ({ transaction }) => {
      const stripeSetupIntentIdPast = `setupintent_past_${core.nanoid()}`
      const {
        result: { subscription: subPast },
      } = await createSubscriptionWorkflow(
        {
          organization,
          product,
          price: defaultPrice,
          quantity: 1,
          livemode: true,
          startDate: new Date('2023-01-01'),
          interval: IntervalUnit.Month,
          intervalCount: 1,
          defaultPaymentMethod: newPaymentMethod,
          customer: newCustomer,
          stripeSetupIntentId: stripeSetupIntentIdPast,
          autoStart: true,
        },
        transaction
      )

      await updateSubscription(
        {
          id: subPast.id,
          status: SubscriptionStatus.Canceled,
          canceledAt: new Date('2023-02-01').getTime(),
          renews: subPast.renews,
        },
        transaction
      )
      return subPast
    })

    const stripeSetupIntentIdCurrent = `setupintent_current_${core.nanoid()}`
    // Should be able to create a new subscription since the past one is canceled
    await expect(
      adminTransaction(async ({ transaction }) => {
        return createSubscriptionWorkflow(
          {
            organization,
            product,
            price: defaultPrice,
            quantity: 1,
            livemode: true,
            startDate: new Date(),
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: newPaymentMethod,
            customer: newCustomer,
            stripeSetupIntentId: stripeSetupIntentIdCurrent,
            autoStart: true,
          },
          transaction
        )
      })
    ).resolves.toBeDefined()
  })

  it('creates billing periods correctly for trial subscriptions', async () => {
    // This test uses its own customer, payment method, and specific trial parameters
    const trialCustomer = await setupCustomer({
      organizationId: organization.id, // Use org from beforeEach
    })
    const trialPaymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: trialCustomer.id,
    })

    const startDate = Date.now()
    const trialEnd = Date.now() + 7 * 24 * 60 * 60 * 1000
    const stripeSetupIntentIdTrial = `setupintent_trial_${core.nanoid()}`

    const {
      result: {
        subscription: trialSubscription,
        billingPeriod: trialBillingPeriod,
      },
    } = await adminTransaction(async ({ transaction }) => {
      return createSubscriptionWorkflow(
        {
          organization,
          product,
          price: defaultPrice,
          quantity: 1,
          livemode: true,
          startDate,
          interval: IntervalUnit.Month,
          intervalCount: 1,
          defaultPaymentMethod: trialPaymentMethod,
          customer: trialCustomer,
          trialEnd,
          stripeSetupIntentId: stripeSetupIntentIdTrial,
          autoStart: true, // autoStart influences initial status
        },
        transaction
      )
    })

    expect(trialSubscription.trialEnd).toBe(trialEnd)
    expect(trialBillingPeriod).toBeDefined()
    expect(trialBillingPeriod!.startDate).toBe(startDate)
    expect(trialBillingPeriod!.endDate).toBe(trialEnd)

    await adminTransaction(async ({ transaction }) => {
      const billingPeriodItems = await selectBillingPeriodItems(
        {
          billingPeriodId: trialBillingPeriod!.id,
        },
        transaction
      )
      expect(billingPeriodItems).toHaveLength(0)
    })
  })

  describe('price type behavior', () => {
    // This nested describe can use `organization`, `product` from the outer scope's beforeEach.
    // It will set up its own customer and paymentMethod per test for clarity, or have its own beforeEach.
    // FIXME: Re-enable this once usage prices are fully deprecated
    it('throws an error when trying to create a subscription with usage price', async () => {
      const usageCustomer = await setupCustomer({
        organizationId: organization.id,
      })
      const usagePaymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: usageCustomer.id,
      })
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Usage Meter',
        pricingModelId: product.pricingModelId,
      })
      const usagePrice = await setupPrice({
        productId: product.id,
        type: PriceType.Usage,
        name: 'Usage Price',
        unitPrice: 100,
        livemode: true,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        isDefault: false,
        currency: CurrencyCode.USD,
        usageMeterId: usageMeter.id,
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          const stripeSetupIntentIdUsage = `setupintent_usage_price_${core.nanoid()}`
          return createSubscriptionWorkflow(
            {
              organization,
              product,
              price: usagePrice, // Use the modified price
              quantity: 1,
              livemode: true,
              startDate: new Date(),
              interval: IntervalUnit.Month,
              intervalCount: 1,
              defaultPaymentMethod: usagePaymentMethod,
              customer: usageCustomer,
              stripeSetupIntentId: stripeSetupIntentIdUsage,
              autoStart: true,
            },
            transaction
          )
        })
      ).rejects.toThrow(
        `Price id: ${usagePrice.id} has usage price. Usage prices are not supported for subscription creation.`
      )
    })

    it('creates a subscription with usage price if the feature flag is enabled', async () => {
      let orgWithFeatureFlag = organization
      await adminTransaction(async ({ transaction }) => {
        orgWithFeatureFlag = await updateOrganization(
          {
            id: organization.id,
            featureFlags: {
              [FeatureFlag.SubscriptionWithUsage]: true,
            },
          },
          transaction
        )
      })

      const usageFeatureCustomer = await setupCustomer({
        organizationId: organization.id,
      })
      const usageFeaturePaymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: usageFeatureCustomer.id,
      })
      const usageFeatureMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Usage Meter',
        pricingModelId: product.pricingModelId,
      })
      const usageFeaturePrice = await setupPrice({
        productId: product.id,
        type: PriceType.Usage,
        name: 'Feature Usage Price',
        unitPrice: 150,
        livemode: true,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        isDefault: false,
        currency: CurrencyCode.USD,
        usageMeterId: usageFeatureMeter.id,
      })

      const {
        result: { subscription: createdSub },
      } = await adminTransaction(async ({ transaction }) => {
        const stripeSetupIntentId = `setupintent_usage_feature_${core.nanoid()}`
        return createSubscriptionWorkflow(
          {
            organization: orgWithFeatureFlag,
            product,
            price: usageFeaturePrice,
            quantity: 2,
            livemode: true,
            startDate: new Date(),
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: usageFeaturePaymentMethod,
            customer: usageFeatureCustomer,
            stripeSetupIntentId,
            autoStart: true,
          },
          transaction
        )
      })

      expect(createdSub).toBeDefined()
      expect(createdSub.priceId).toBe(usageFeaturePrice.id)
      expect(createdSub.status).toBe(SubscriptionStatus.Active)
      // runBillingAtPeriodStart should normally be false for usage price
      expect(createdSub.runBillingAtPeriodStart).toBe(false)
    })

    it('sets runBillingAtPeriodStart to true for subscription price', async () => {
      const subPriceCustomer = await setupCustomer({
        organizationId: organization.id,
      })
      const subPricePaymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: subPriceCustomer.id,
      })

      // defaultPrice from outer beforeEach is already a subscription type
      const {
        result: { subscription: subTypeSubscription },
      } = await adminTransaction(async ({ transaction }) => {
        const stripeSetupIntentIdSubType = `setupintent_sub_type_${core.nanoid()}`
        return createSubscriptionWorkflow(
          {
            organization,
            product,
            price: defaultPrice, // Use defaultPrice (subscription type)
            quantity: 1,
            livemode: true,
            startDate: new Date(),
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: subPricePaymentMethod,
            customer: subPriceCustomer,
            stripeSetupIntentId: stripeSetupIntentIdSubType,
            autoStart: true,
          },
          transaction
        )
      })
      expect(subTypeSubscription.runBillingAtPeriodStart).toBe(true)
    })

    it('throws if price is not subscription type for a non-default product', async () => {
      const singlePayCustomer = await setupCustomer({
        organizationId: organization.id,
      })

      const singlePayPaymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: singlePayCustomer.id,
      })
      const nonDefaultProduct = await setupProduct({
        organizationId: organization.id,
        pricingModelId: product.pricingModelId,
        name: 'Non Default Product',
        livemode: true,
      })
      const singlePaymentPrice = await setupPrice({
        productId: nonDefaultProduct.id,
        type: PriceType.SinglePayment,
        name: 'Single Payment Price',
        unitPrice: 100,
        livemode: true,
        isDefault: false,
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          const stripeSetupIntentIdSingle = `setupintent_single_pay_${core.nanoid()}`
          return createSubscriptionWorkflow(
            {
              organization,
              product: nonDefaultProduct,
              price: singlePaymentPrice, // Use the single payment price
              quantity: 1,
              livemode: true,
              startDate: new Date(),
              interval: IntervalUnit.Month,
              intervalCount: 1,
              defaultPaymentMethod: singlePayPaymentMethod,
              customer: singlePayCustomer,
              stripeSetupIntentId: stripeSetupIntentIdSingle,
              // autoStart: true, // Not relevant for this check
            },
            transaction
          )
        })
      ).rejects.toThrow('Price is not a subscription')
    })

    it('creates a non-renewing subscription if provided a default product and non-subscribable price', async () => {
      const defaultProductCustomer = await setupCustomer({
        organizationId: organization.id,
      })

      const defaultProductPaymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: defaultProductCustomer.id,
      })

      // Use the default product from setupOrg
      const singlePaymentPrice = await setupPrice({
        productId: product.id, // Use the default product
        type: PriceType.SinglePayment,
        name: 'Single Payment Price for Default Product',
        unitPrice: 100,
        livemode: true,
        isDefault: false,
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          return createSubscriptionWorkflow(
            {
              organization,
              product, // Use the default product
              price: singlePaymentPrice,
              quantity: 1,
              livemode: true,
              startDate: new Date(),
              interval: IntervalUnit.Month,
              intervalCount: 1,
              defaultPaymentMethod: defaultProductPaymentMethod,
              customer: defaultProductCustomer,
              autoStart: true, // Enable autoStart to get an active subscription
            },
            transaction
          )
        }
      )

      // Verify a subscription was created successfully
      expect(result.result.subscription).toBeDefined()
      expect(result.result.subscription.customerId).toBe(
        defaultProductCustomer.id
      )
      expect(result.result.subscription.priceId).toBe(
        singlePaymentPrice.id
      )
      // Since it's a single payment price with default product, it should create a non-renewing subscription
      expect(result.result.subscription.renews).toBe(false) // Non-renewing subscriptions do not renew
      expect(result.result.subscription.status).toBe(
        SubscriptionStatus.Active
      )

      // Verify billing period was created
      expect(result.result.billingPeriod).toBeNull()

      // Verify subscription items were created
      expect(result.result.subscriptionItems).toBeDefined()
      expect(result.result.subscriptionItems.length).toBeGreaterThan(
        0
      )
    })
  })

  it("doesn't recreate subscriptions, billing periods, or billing period items for the same setup intent", async () => {
    // This test has specific setup requirements for an INCOMPLETE subscription first.
    const startDate = Date.now()
    const intentCustomer = await setupCustomer({
      organizationId: organization.id,
    })
    const intentPaymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: intentCustomer.id,
    })

    // Create initial subscription and set to Incomplete
    const firstSubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: intentCustomer.id,
      paymentMethodId: intentPaymentMethod.id,
      priceId: defaultPrice.id, // Use defaultPrice from outer beforeEach
      interval: IntervalUnit.Month,
      intervalCount: 1,
      trialEnd: Date.now() + 7 * 24 * 60 * 60 * 1000,
      status: SubscriptionStatus.Incomplete, // Critical for this test
      startDate: startDate,
    })
    await setupSubscriptionItem({
      subscriptionId: firstSubscription.id,
      name: 'Test Item',
      quantity: 1,
      unitPrice: defaultPrice.unitPrice,
      priceId: defaultPrice.id,
    })
    const firstBillingPeriod = await setupBillingPeriod({
      subscriptionId: firstSubscription.id,
      startDate,
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Example end date
    })
    await setupBillingPeriodItem({
      billingPeriodId: firstBillingPeriod.id,
      quantity: 1,
      unitPrice: defaultPrice.unitPrice,
    })

    // Store the first billing run
    const { result: firstResult } = await adminTransaction(
      async ({ transaction }) => {
        return createSubscriptionWorkflow(
          {
            organization,
            product,
            price: defaultPrice,
            quantity: 1,
            livemode: true,
            startDate,
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: intentPaymentMethod,
            customer: intentCustomer,
            stripeSetupIntentId:
              firstSubscription.stripeSetupIntentId!,
            autoStart: true, // Or false, depending on what it should do with incomplete
          },
          transaction
        )
      }
    )

    // Attempt second creation with same setup intent
    const { result: secondResult } = await adminTransaction(
      async ({ transaction }) => {
        return createSubscriptionWorkflow(
          {
            organization,
            product,
            price: defaultPrice,
            quantity: 1,
            livemode: true,
            startDate,
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: intentPaymentMethod,
            customer: intentCustomer,
            stripeSetupIntentId:
              firstSubscription.stripeSetupIntentId!,
            autoStart: true,
          },
          transaction
        )
      }
    )

    expect(secondResult.subscription.id).toBe(firstSubscription.id)
    expect(secondResult.billingRun?.id).toBe(
      firstResult.billingRun?.id
    )
  })

  it('should NOT have a billingRun if no defaultPaymentMethod is provided and customer has no payment method', async () => {
    // Specific setup: customer with no payment method
    const customerWithoutPM = await setupCustomer({
      organizationId: organization.id,
    })
    const stripeSetupIntentIdNoPM = `setupintent_no_pm_${core.nanoid()}`

    const {
      result: { billingRun: noPmBillingRun },
    } = await adminTransaction(async ({ transaction }) => {
      return createSubscriptionWorkflow(
        {
          organization,
          product,
          price: defaultPrice,
          quantity: 1,
          livemode: true,
          startDate: new Date(),
          interval: IntervalUnit.Month,
          intervalCount: 1,
          customer: customerWithoutPM,
          stripeSetupIntentId: stripeSetupIntentIdNoPM,
          // defaultPaymentMethod is omitted
          // autoStart can be true or false, outcome should be no billing run
        },
        transaction
      )
    })
    expect(noPmBillingRun).toBeNull()
  })

  it('should execute with a billingRun if price has no trial period, customer has a default payment method, but no defaultPaymentMethodId is provided', async () => {
    // Specific setup: customer with a default payment method in DB
    const customerWithDefaultPM = await setupCustomer({
      organizationId: organization.id,
    })
    const defaultCustPaymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customerWithDefaultPM.id,
      default: true, // Set as default in DB
    })
    const stripeSetupIntentIdCustPM = `setupintent_cust_pm_${core.nanoid()}`
    expect(defaultPrice.trialPeriodDays).toBe(0)
    expect(defaultPrice.type).toBe(PriceType.Subscription)
    const {
      result: { billingRun: custPmBillingRun },
    } = await adminTransaction(async ({ transaction }) => {
      return createSubscriptionWorkflow(
        {
          organization,
          product,
          price: defaultPrice,
          quantity: 1,
          livemode: true,
          startDate: new Date(),
          interval: IntervalUnit.Month,
          intervalCount: 1,
          customer: customerWithDefaultPM,
          stripeSetupIntentId: stripeSetupIntentIdCustPM,
          // defaultPaymentMethod is omitted in params to createSubscriptionWorkflow
          autoStart: true, // Important for billing run creation
        },
        transaction
      )
    })
    expect(custPmBillingRun).toBeDefined()
    expect(custPmBillingRun?.status).toBe(BillingRunStatus.Scheduled)
    expect(custPmBillingRun?.paymentMethodId).toBe(
      defaultCustPaymentMethod.id
    )
  })

  it('throws an error if defaultPaymentMethod customerId does not match customer id', async () => {
    // Setup a different customer for the payment method
    const anotherCustomer = await setupCustomer({
      organizationId: organization.id, // Use org from beforeEach
      email: `another+${core.nanoid()}@test.com`, // Ensure different email
    })
    const stripeSetupIntentIdMismatch = `setupintent_mismatch_${core.nanoid()}`

    await expect(
      adminTransaction(async ({ transaction }) => {
        return createSubscriptionWorkflow(
          {
            organization, // from beforeEach
            product, // from beforeEach
            price: defaultPrice, // from beforeEach
            quantity: 1,
            livemode: true,
            startDate: new Date(),
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: paymentMethod, // Belongs to anotherCustomer
            customer: anotherCustomer, // The main customer for the subscription (from beforeEach)
            stripeSetupIntentId: stripeSetupIntentIdMismatch,
            autoStart: true,
          },
          transaction
        )
      })
    ).rejects.toThrow(
      `Customer ${anotherCustomer.id} does not match default payment method ${paymentMethod.customerId}`
    )
  })
})

describe('createSubscriptionWorkflow billing run creation', async () => {
  let organization: Organization.Record
  let product: Product.Record
  let defaultPriceForBillingRunTests: Price.Record // Specific name for this context

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    product = orgData.product
    defaultPriceForBillingRunTests = orgData.price
  })

  it('creates a billing run when price is subscription type and a default payment method exists', async () => {
    // customer and paymentMethod are specific to this test
    const customer = await setupCustomer({
      organizationId: organization.id, // from beforeEach
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    // Ensure the price is of subscription type (defaultPriceForBillingRunTests should be, but make explicit)
    const subscriptionPrice = {
      ...defaultPriceForBillingRunTests,
      id: defaultPriceForBillingRunTests.id, // Ensure ID is carried over if updatePrice is not used
      type: PriceType.Subscription,
    } as Price.Record // Asserting as Record, assuming no update needed if already correct type

    const {
      result: { billingRun },
    } = await adminTransaction(async ({ transaction }) => {
      const stripeSetupIntentId = `setupintent_br_sub_pm_${core.nanoid()}`
      return createSubscriptionWorkflow(
        {
          organization, // from beforeEach
          product, // from beforeEach
          price: subscriptionPrice, // Use the explicitly typed subscription price
          quantity: 1,
          livemode: true,
          startDate: new Date(),
          interval: IntervalUnit.Month,
          intervalCount: 1,
          defaultPaymentMethod: paymentMethod,
          customer,
          stripeSetupIntentId,
          autoStart: true,
        },
        transaction
      )
    })
    expect(billingRun).toBeDefined()
    expect(billingRun?.status).toBe(BillingRunStatus.Scheduled)
  })

  it('does NOT create a billing run when price is subscription type but no default payment method exists', async () => {
    const customerWithoutPM = await setupCustomer({
      organizationId: organization.id, // from beforeEach
    })

    const subscriptionPrice = {
      ...defaultPriceForBillingRunTests,
      id: defaultPriceForBillingRunTests.id,
      type: PriceType.Subscription,
    } as Price.Record

    const {
      result: { billingRun },
    } = await adminTransaction(async ({ transaction }) => {
      const stripeSetupIntentId = `setupintent_br_sub_nopm_${core.nanoid()}`
      return createSubscriptionWorkflow(
        {
          organization,
          product,
          price: subscriptionPrice,
          quantity: 1,
          livemode: true,
          startDate: new Date(),
          interval: IntervalUnit.Month,
          intervalCount: 1,
          defaultPaymentMethod: undefined,
          customer: customerWithoutPM,
          stripeSetupIntentId,
          autoStart: true,
        },
        transaction
      )
    })
    expect(billingRun).toBeNull()
  })

  it('does NOT create a billing run when autoStart is false, even if price is subscription and payment method exists', async () => {
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const subscriptionPrice = {
      ...defaultPriceForBillingRunTests,
      id: defaultPriceForBillingRunTests.id,
      type: PriceType.Subscription,
    } as Price.Record

    const {
      result: { billingRun, subscription },
    } = await adminTransaction(async ({ transaction }) => {
      const stripeSetupIntentId = `setupintent_br_no_autostart_${core.nanoid()}`
      return createSubscriptionWorkflow(
        {
          organization,
          product,
          price: subscriptionPrice,
          quantity: 1,
          livemode: true,
          startDate: new Date(),
          interval: IntervalUnit.Month,
          intervalCount: 1,
          defaultPaymentMethod: paymentMethod,
          customer,
          stripeSetupIntentId,
          autoStart: false, // Key for this test
        },
        transaction
      )
    })
    // expect(subscription.status).toBe(SubscriptionStatus.Incomplete)
    expect(billingRun).toBeNull()
  })

  it('does not create a billing run if autoStart is not provided', async () => {
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const subscriptionPrice = {
      ...defaultPriceForBillingRunTests,
      id: defaultPriceForBillingRunTests.id,
      type: PriceType.Subscription,
    } as Price.Record

    const {
      result: { billingRun, subscription },
    } = await adminTransaction(async ({ transaction }) => {
      const stripeSetupIntentId = `setupintent_br_no_autostart_param_${core.nanoid()}`
      return createSubscriptionWorkflow(
        {
          organization,
          product,
          price: subscriptionPrice,
          quantity: 1,
          livemode: true,
          startDate: new Date(),
          interval: IntervalUnit.Month,
          intervalCount: 1,
          defaultPaymentMethod: paymentMethod,
          customer,
          stripeSetupIntentId,
          // autoStart is not provided (defaults to false in createSubscriptionWorkflow logic)
        },
        transaction
      )
    })
    expect(subscription.status).toBe(SubscriptionStatus.Incomplete)
    expect(billingRun).toBeNull()
  })
})

describe('createSubscriptionWorkflow with SubscriptionItemFeatures', async () => {
  it('should create SubscriptionItemFeatures when a subscription is created for a product with features', async () => {
    const { organization, product, price, pricingModel } =
      await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
      livemode: true,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      livemode: true,
    })

    const featureSpecs = [
      {
        name: 'Test Toggle Feature for Subscription',
        type: FeatureType.Toggle,
      },
      {
        name: 'Test Credit Feature for Subscription',
        type: FeatureType.UsageCreditGrant,
        amount: 100,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        usageMeterName: 'CreditMeterForSubTest',
      },
    ]

    const createdFeaturesAndPfs =
      await setupTestFeaturesAndProductFeatures({
        organizationId: organization.id,
        productId: product.id,
        livemode: true,
        featureSpecs,
      })

    const {
      result: { subscription, subscriptionItems },
    } = await adminTransaction(async ({ transaction }) => {
      const stripeSetupIntentId = `setupintent_${core.nanoid()}`
      return createSubscriptionWorkflow(
        {
          organization,
          product, // This product now has features linked via createdFeaturesAndPfs
          price,
          quantity: 1,
          livemode: true,
          startDate: new Date(),
          interval: IntervalUnit.Month,
          intervalCount: 1,
          defaultPaymentMethod: paymentMethod,
          customer,
          stripeSetupIntentId,
          autoStart: true,
        },
        transaction
      )
    })

    expect(subscription).toBeDefined()
    expect(subscriptionItems).toBeDefined()
    expect(subscriptionItems.length).toBe(1)
    const subItem = subscriptionItems[0]

    const createdSifs = await adminTransaction(
      async ({ transaction }) => {
        return selectSubscriptionItemFeatures(
          { subscriptionItemId: [subItem.id] },
          transaction
        )
      }
    )

    expect(createdSifs.length).toBe(featureSpecs.length)

    for (const featureSpec of featureSpecs) {
      const originalFeatureSetup = createdFeaturesAndPfs.find(
        (f) => f.feature.name === featureSpec.name
      )
      expect(originalFeatureSetup).toBeDefined()

      const sif = createdSifs.find(
        (s) => s.featureId === originalFeatureSetup!.feature.id
      )
      expect(sif).toBeDefined()
      expect(sif!.subscriptionItemId).toBe(subItem.id)
      expect(sif!.productFeatureId).toBe(
        originalFeatureSetup!.productFeature.id
      )
      expect(sif!.type).toBe(originalFeatureSetup!.feature.type)
      expect(sif!.livemode).toBe(subItem.livemode)
      expect(sif!.livemode).toBe(true) // explicit check for this test

      if (sif!.type === FeatureType.UsageCreditGrant) {
        expect(sif!.amount).toBe(originalFeatureSetup!.feature.amount)
        expect(sif!.renewalFrequency).toBe(
          originalFeatureSetup!.feature.renewalFrequency
        )
        expect(sif!.usageMeterId).toBe(
          originalFeatureSetup!.feature.usageMeterId
        )
      } else if (sif!.type === FeatureType.Toggle) {
        expect(sif!.amount).toBeNull()
        expect(sif!.renewalFrequency).toBeNull()
        expect(sif!.usageMeterId).toBeNull()
      }
    }
  })

  it('should create SubscriptionItemFeatures with correct livemode (false) based on the subscription item', async () => {
    const { organization, product, price, pricingModel } =
      await setupOrg() // Create org/product/price with livemode false
    const customer = await setupCustomer({
      organizationId: organization.id,
      livemode: false,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      livemode: false,
    })

    const featureSpecs = [
      {
        name: 'Test Toggle Livemode False',
        type: FeatureType.Toggle,
      },
    ]

    const createdFeaturesAndPfs =
      await setupTestFeaturesAndProductFeatures({
        organizationId: organization.id,
        productId: product.id,
        livemode: false, // livemode: false for features
        featureSpecs,
      })

    const {
      result: { subscription, subscriptionItems },
    } = await adminTransaction(async ({ transaction }) => {
      const stripeSetupIntentId = `setupintent_${core.nanoid()}`
      return createSubscriptionWorkflow(
        {
          organization,
          product,
          price,
          quantity: 1,
          livemode: false, // livemode: false for subscription
          startDate: new Date(),
          interval: IntervalUnit.Month,
          intervalCount: 1,
          defaultPaymentMethod: paymentMethod,
          customer,
          stripeSetupIntentId,
          autoStart: true,
        },
        transaction
      )
    })

    expect(subscription.livemode).toBe(false)
    expect(subscriptionItems.length).toBe(1)
    const subItem = subscriptionItems[0]
    expect(subItem.livemode).toBe(false)

    const createdSifs = await adminTransaction(
      async ({ transaction }) => {
        return selectSubscriptionItemFeatures(
          { subscriptionItemId: [subItem.id] },
          transaction
        )
      }
    )

    expect(createdSifs.length).toBe(1)
    const sif = createdSifs[0]
    expect(sif).toBeDefined()
    expect(sif.livemode).toBe(false)
    expect(sif.featureId).toBe(createdFeaturesAndPfs[0].feature.id)
  })

  it('should associate the correct usageMeterId with usage credit grant SubscriptionItemFeatures', async () => {
    // Setup
    const { organization, product, price, pricingModel } =
      await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Meter for explicit test',
    })
    const creditGrantFeature = await setupUsageCreditGrantFeature({
      organizationId: organization.id,
      name: 'Credit Grant Feature for explicit test',
      usageMeterId: usageMeter.id,
      renewalFrequency: FeatureUsageGrantFrequency.Once,
      amount: 123,
      livemode: true,
      pricingModelId: pricingModel.id,
    })
    await setupProductFeature({
      organizationId: organization.id,
      productId: product.id,
      featureId: creditGrantFeature.id,
      livemode: true,
    })

    // Action
    const {
      result: { subscriptionItems },
    } = await adminTransaction(async ({ transaction }) => {
      const stripeSetupIntentId = `setupintent_${core.nanoid()}`
      return createSubscriptionWorkflow(
        {
          organization,
          product,
          price,
          quantity: 1,
          livemode: true,
          startDate: new Date(),
          interval: IntervalUnit.Month,
          intervalCount: 1,
          defaultPaymentMethod: paymentMethod,
          customer,
          stripeSetupIntentId,
          autoStart: true,
        },
        transaction
      )
    })

    // Assertions
    expect(subscriptionItems.length).toBe(1)
    const subItem = subscriptionItems[0]

    const createdSifs = await adminTransaction(
      async ({ transaction }) => {
        return selectSubscriptionItemFeatures(
          { subscriptionItemId: [subItem.id] },
          transaction
        )
      }
    )

    expect(createdSifs.length).toBe(1)
    const creditSif = createdSifs[0]
    expect(creditSif.featureId).toBe(creditGrantFeature.id)
    expect(creditSif.type).toBe(FeatureType.UsageCreditGrant)
    expect(creditSif.usageMeterId).toBe(usageMeter.id)
    expect(creditSif.usageMeterId).not.toBeNull()
  })

  it('should NOT create SubscriptionItemFeatures if the product has no associated features', async () => {
    // Standard setupOrg creates product/price without features
    const { organization, product, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const {
      result: { subscriptionItems },
    } = await adminTransaction(async ({ transaction }) => {
      const stripeSetupIntentId = `setupintent_${core.nanoid()}`
      return createSubscriptionWorkflow(
        {
          organization,
          product, // This product has no features
          price,
          quantity: 1,
          livemode: true,
          startDate: new Date(),
          interval: IntervalUnit.Month,
          intervalCount: 1,
          defaultPaymentMethod: paymentMethod,
          customer,
          stripeSetupIntentId,
          autoStart: true,
        },
        transaction
      )
    })

    expect(subscriptionItems.length).toBe(1)
    const subItem = subscriptionItems[0]

    const queriedSifs = await adminTransaction(
      async ({ transaction }) => {
        return selectSubscriptionItemFeatures(
          { subscriptionItemId: [subItem.id] },
          transaction
        )
      }
    )
    expect(queriedSifs.length).toBe(0)
  })

  // New test for quantity-based usage credit grant amount
  it('should multiply usage credit grant amount by subscription item quantity for usage based product features', async () => {
    const { organization, product, price, pricingModel } =
      await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const featureSpecs = [
      {
        name: 'Quantity Based Credit Feature',
        type: FeatureType.UsageCreditGrant,
        amount: 50,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        usageMeterName: 'QuantityMeter',
      },
    ]

    const createdFeaturesAndPfs =
      await setupTestFeaturesAndProductFeatures({
        organizationId: organization.id,
        productId: product.id,
        livemode: true,
        featureSpecs,
      })

    const quantity = 3

    const {
      result: { subscriptionItems },
    } = await adminTransaction(async ({ transaction }) => {
      const stripeSetupIntentId = `setupintent_${core.nanoid()}`
      return createSubscriptionWorkflow(
        {
          organization,
          product,
          price,
          quantity,
          livemode: true,
          startDate: new Date(),
          interval: IntervalUnit.Month,
          intervalCount: 1,
          defaultPaymentMethod: paymentMethod,
          customer,
          stripeSetupIntentId,
          autoStart: true,
        },
        transaction
      )
    })

    expect(subscriptionItems.length).toBe(1)
    const subItem = subscriptionItems[0]
    expect(subItem.quantity).toBe(quantity)

    const createdSifs = await adminTransaction(
      async ({ transaction }) => {
        return selectSubscriptionItemFeatures(
          { subscriptionItemId: [subItem.id] },
          transaction
        )
      }
    )

    expect(createdSifs.length).toBe(1)
    const sif = createdSifs[0]
    const originalFeatureSetup = createdFeaturesAndPfs[0]
    expect(sif.amount).toBe(
      originalFeatureSetup.feature.amount! * subItem.quantity
    )
  })
})

describe('createSubscriptionWorkflow ledger account creation', async () => {
  let organization: Organization.Record
  let defaultProduct: Product.Record
  let defaultSubscriptionPrice: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    defaultProduct = orgData.product
    defaultSubscriptionPrice = orgData.price

    customer = await setupCustomer({
      organizationId: organization.id,
    })
    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })
  })

  // FIXME: Re-enable this once usage prices are fully deprecated
  // it('throws an error when trying to create a subscription with usage price for ledger account creation', async () => {
  //   const usageMeter = await setupUsageMeter({
  //     organizationId: organization.id,
  //     pricingModelId: defaultProduct.pricingModelId,
  //     name: 'Test Usage Meter for Ledger Account',
  //   })

  //   await expect(
  //     adminTransaction(async ({ transaction }) => {
  //       const usagePriceUpdatePayload: Price.Update = {
  //         ...defaultSubscriptionPrice,
  //         id: defaultSubscriptionPrice.id,
  //         type: PriceType.Usage,
  //         usageMeterId: usageMeter.id,
  //         name: `${defaultSubscriptionPrice.name} (Usage)`,
  //         trialPeriodDays: null,
  //         intervalUnit: undefined,
  //         intervalCount: undefined,
  //         usageEventsPerUnit: 1,
  //       }

  //       const usagePrice = await updatePrice(
  //         usagePriceUpdatePayload,
  //         transaction
  //       )
  //       const stripeSetupIntentId = `setupintent_ledger_usage_${core.nanoid()}`
  //       return createSubscriptionWorkflow(
  //         {
  //           organization,
  //           product: defaultProduct,
  //           price: usagePrice,
  //           quantity: 1,
  //           livemode: true,
  //           startDate: new Date(),
  //           interval: IntervalUnit.Month,
  //           intervalCount: 1,
  //           defaultPaymentMethod: paymentMethod,
  //           customer,
  //           stripeSetupIntentId,
  //           autoStart: true,
  //         },
  //         transaction
  //       )
  //     })
  //   ).rejects.toThrow(
  //     `Price id: ${defaultSubscriptionPrice.id} has usage price. Usage prices are not supported for subscription creation.`
  //   )
  // })

  it('does NOT create ledger accounts when the price is not a usage price (e.g., subscription type)', async () => {
    // Pre-condition check for the default price from setupOrg (now from beforeEach)
    expect(defaultSubscriptionPrice.type).not.toBe(PriceType.Usage)
    expect(defaultSubscriptionPrice.usageMeterId).toBeNull()

    const {
      result: { subscription },
    } = await adminTransaction(async ({ transaction }) => {
      const stripeSetupIntentId = `setupintent_ledger_nonusage_${core.nanoid()}`
      return createSubscriptionWorkflow(
        {
          organization,
          product: defaultProduct,
          price: defaultSubscriptionPrice,
          quantity: 1,
          livemode: true,
          startDate: new Date(),
          interval: IntervalUnit.Month,
          intervalCount: 1,
          defaultPaymentMethod: paymentMethod,
          customer,
          stripeSetupIntentId,
          autoStart: true,
        },
        transaction
      )
    })

    const ledgerAccounts = await adminTransaction(
      async ({ transaction }) => {
        return selectLedgerAccounts(
          { subscriptionId: subscription.id },
          transaction
        )
      }
    )

    expect(ledgerAccounts.length).toBe(0)
  })
})

describe('createSubscriptionWorkflow with discount redemption', async () => {
  let organization: Organization.Record
  let product: Product.Record
  let defaultPrice: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let pricingModel: PricingModel.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    product = orgData.product
    defaultPrice = orgData.price
    pricingModel = orgData.pricingModel
    customer = await setupCustomer({
      organizationId: organization.id,
    })
    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })
  })

  it('should create a subscription with a single discount redemption', async () => {
    // Create a discount first
    const discount = await setupDiscount({
      organizationId: organization.id,
      name: 'Test Discount',
      amount: 10, // 10% off
      amountType: DiscountAmountType.Percent,
      code: 'TEST10',
      livemode: true,
    })

    const purchase = await setupPurchase({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: defaultPrice.id,
      livemode: true,
    })

    const discountRedemption = await setupDiscountRedemption({
      discount,
      purchaseId: purchase.id,
    })

    const result = await comprehensiveAdminTransaction(
      async ({ transaction }) => {
        const stripeSetupIntentId = `setupintent_discount_${core.nanoid()}`
        return createSubscriptionWorkflow(
          {
            organization,
            product,
            price: defaultPrice,
            quantity: 1,
            livemode: true,
            startDate: new Date(),
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: paymentMethod,
            customer,
            stripeSetupIntentId,
            autoStart: true,
            discountRedemption,
          },
          transaction
        )
      }
    )

    const {
      subscription,
      subscriptionItems,
      billingPeriod,
      billingRun,
    } = result

    expect(subscription).toBeDefined()
    expect(subscriptionItems.length).toBeGreaterThan(0)

    // Verify discount redemption was updated
    const updatedDiscountRedemption = await adminTransaction(
      async ({ transaction }) => {
        return selectDiscountRedemptionById(
          discountRedemption.id,
          transaction
        )
      }
    )
    expect(updatedDiscountRedemption.subscriptionId).toBe(
      subscription.id
    )
    /**
     * NOTE: no point in asserting discount reflection in other bookkeeping records,
     * as the discount redemption's impact is calculated AFTER computing the billing period items, which themselves are a
     * "pre-discount redemption" calculation.
     */
  })

  it('should create a subscription with multiple discount redemptions', async () => {
    const discounts = await Promise.all([
      setupDiscount({
        organizationId: organization.id,
        name: 'Test Discount 1',
        amount: 10,
        amountType: DiscountAmountType.Percent,
        code: 'TEST10_1',
        livemode: true,
      }),
      setupDiscount({
        organizationId: organization.id,
        name: 'Test Discount 2',
        amount: 15,
        amountType: DiscountAmountType.Percent,
        code: 'TEST15_2',
        livemode: true,
      }),
    ])

    const discountRedemptions = await Promise.all(
      discounts.map(async (discount) => {
        const purchase = await setupPurchase({
          organizationId: organization.id,
          customerId: customer.id,
          priceId: defaultPrice.id,
          livemode: true,
        })
        return setupDiscountRedemption({
          discount,
          purchaseId: purchase.id,
        })
      })
    )

    const result = await comprehensiveAdminTransaction(
      async ({ transaction }) => {
        const stripeSetupIntentId = `setupintent_multi_discount_${core.nanoid()}`
        return createSubscriptionWorkflow(
          {
            organization,
            product,
            price: defaultPrice,
            quantity: 1,
            livemode: true,
            startDate: new Date(),
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: paymentMethod,
            customer,
            stripeSetupIntentId,
            autoStart: true,
            discountRedemption: discountRedemptions[0], // Currently only supports one discount
          },
          transaction
        )
      }
    )

    const { subscription, subscriptionItems } = result

    expect(subscription).toBeDefined()
    expect(subscriptionItems.length).toBeGreaterThan(0)

    // Verify first discount redemption was updated
    const updatedDiscountRedemption = await adminTransaction(
      async ({ transaction }) => {
        return selectDiscountRedemptionById(
          discountRedemptions[0].id,
          transaction
        )
      }
    )
    expect(updatedDiscountRedemption.subscriptionId).toBe(
      subscription.id
    )

    // Verify second discount redemption was not updated
    const unchangedDiscountRedemption = await adminTransaction(
      async ({ transaction }) => {
        return selectDiscountRedemptionById(
          discountRedemptions[1].id,
          transaction
        )
      }
    )
    expect(unchangedDiscountRedemption.subscriptionId).toBeNull()
  })

  it('should handle trial periods correctly with discount redemptions', async () => {
    const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    const discount = await setupDiscount({
      organizationId: organization.id,
      name: 'Test Discount',
      amount: 10,
      amountType: DiscountAmountType.Percent,
      code: 'TEST10_' + core.nanoid().substring(0, 8),
      livemode: true,
    })
    const purchase = await setupPurchase({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: defaultPrice.id,
      livemode: true,
    })
    const { subscription, subscriptionItems, billingPeriod } =
      await comprehensiveAdminTransaction(async ({ transaction }) => {
        const stripeSetupIntentId = `setupintent_trial_discount_${core.nanoid()}`
        const discountRedemption = await insertDiscountRedemption(
          // @ts-expect-error - FIXME: fix this
          {
            purchaseId: purchase.id,
            discountId: discount.id,
            livemode: true,
            duration: discount.duration,
            numberOfPayments: discount.numberOfPayments,
            discountName: discount.name,
            discountCode: discount.code,
            discountAmount: discount.amount,
            discountAmountType: discount.amountType,
          },
          transaction
        )
        const { result } = await createSubscriptionWorkflow(
          {
            organization,
            product,
            price: defaultPrice,
            quantity: 1,
            livemode: true,
            startDate: new Date(),
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: paymentMethod,
            customer,
            stripeSetupIntentId,
            autoStart: true,
            trialEnd,
            discountRedemption,
          },
          transaction
        )
        return {
          result,
        }
      })

    expect(subscription).toBeDefined()
    expect(subscription.trialEnd).toBe(trialEnd.getTime())
    expect(subscriptionItems.length).toBeGreaterThan(0)
    expect(billingPeriod).toBeDefined()
    expect(billingPeriod!.endDate).toBe(trialEnd.getTime())
  })

  describe('createSubscriptionWorkflow - Ledger Command Creation', () => {
    it('should create billing period transition ledger command for non-renewing subscription', async () => {
      const newPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return insertPricingModel(
            {
              name: 'Test Pricing Model',
              organizationId: organization.id,
              livemode: true,
              isDefault: false,
            },
            transaction
          )
        }
      )

      const defaultProduct = await setupProduct({
        organizationId: organization.id,
        name: 'Default Product',
        pricingModelId: newPricingModel.id,
        default: true,
        livemode: true,
      })

      const singlePaymentPrice = await setupPrice({
        productId: defaultProduct.id,
        name: 'Single Payment Price',
        type: PriceType.SinglePayment,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: organization.defaultCurrency,
      })

      const newCustomer = await setupCustomer({
        organizationId: organization.id,
      })
      const newPaymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: newCustomer.id,
      })

      const stripeSetupIntentId = `setupintent_nonrenewing_${core.nanoid()}`
      const workflowResult = await adminTransaction(
        async ({
          transaction,
        }): Promise<
          TransactionOutput<
            | StandardCreateSubscriptionResult
            | NonRenewingCreateSubscriptionResult
          >
        > => {
          return createSubscriptionWorkflow(
            {
              organization,
              product: defaultProduct,
              price: singlePaymentPrice,
              quantity: 1,
              livemode: true,
              startDate: new Date(),
              interval: IntervalUnit.Month,
              intervalCount: 1,
              defaultPaymentMethod: newPaymentMethod,
              customer: newCustomer,
              stripeSetupIntentId,
              autoStart: true,
            },
            transaction
          )
        }
      )

      expect(workflowResult.ledgerCommand).toBeDefined()
      expect(workflowResult.ledgerCommand?.type).toBe(
        LedgerTransactionType.BillingPeriodTransition
      )
      expect(workflowResult.result.subscription).toBeDefined()
      expect(workflowResult.result.subscription.renews).toBe(false)
    })

    it('should create billing period transition ledger command for free plan subscription', async () => {
      const freePrice = await setupPrice({
        productId: product.id,
        name: 'Free Plan',
        type: PriceType.Subscription,
        unitPrice: 0, // Free plan
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: organization.defaultCurrency,
      })

      const newCustomer = await setupCustomer({
        organizationId: organization.id,
      })
      const newPaymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: newCustomer.id,
      })

      const stripeSetupIntentId = `setupintent_free_${core.nanoid()}`
      const workflowResult = await adminTransaction(
        async ({
          transaction,
        }): Promise<
          TransactionOutput<
            | StandardCreateSubscriptionResult
            | NonRenewingCreateSubscriptionResult
          >
        > => {
          return createSubscriptionWorkflow(
            {
              organization,
              product: {
                ...product,
                default: false, // Not default plan
              },
              price: freePrice,
              quantity: 1,
              livemode: true,
              startDate: new Date(),
              interval: IntervalUnit.Month,
              intervalCount: 1,
              defaultPaymentMethod: newPaymentMethod,
              customer: newCustomer,
              stripeSetupIntentId,
              autoStart: true,
            },
            transaction
          )
        }
      )

      // Check if subscription is marked as free plan
      const createdSubscription = workflowResult.result.subscription
      expect(createdSubscription.isFreePlan).toBe(true)
      expect(workflowResult.ledgerCommand).toBeDefined()
      expect(workflowResult.ledgerCommand?.type).toBe(
        LedgerTransactionType.BillingPeriodTransition
      )
    })

    it('should NOT create billing period transition ledger command for standard renewing subscription', async () => {
      const newCustomer = await setupCustomer({
        organizationId: organization.id,
      })
      const newPaymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: newCustomer.id,
      })

      const stripeSetupIntentId = `setupintent_standard_${core.nanoid()}`
      const workflowResult = await adminTransaction(
        async ({
          transaction,
        }): Promise<
          TransactionOutput<
            | StandardCreateSubscriptionResult
            | NonRenewingCreateSubscriptionResult
          >
        > => {
          return createSubscriptionWorkflow(
            {
              organization,
              product,
              price: defaultPrice,
              quantity: 1,
              livemode: true,
              startDate: new Date(),
              interval: IntervalUnit.Month,
              intervalCount: 1,
              defaultPaymentMethod: newPaymentMethod,
              customer: newCustomer,
              stripeSetupIntentId,
              autoStart: true,
            },
            transaction
          )
        }
      )

      expect(workflowResult.ledgerCommand).toBeUndefined()
      expect(workflowResult.result.subscription).toBeDefined()
      // Standard subscriptions should renew by default (unless they're default products with non-subscription prices)
      expect(workflowResult.result.subscription.renews).toBe(true)
    })

    it('should NOT create billing period transition ledger command when subscription status is Incomplete', async () => {
      const newCustomer = await setupCustomer({
        organizationId: organization.id,
      })
      const newPaymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: newCustomer.id,
      })

      const stripeSetupIntentId = `setupintent_incomplete_${core.nanoid()}`
      const workflowResult = await adminTransaction(
        async ({
          transaction,
        }): Promise<
          TransactionOutput<
            | StandardCreateSubscriptionResult
            | NonRenewingCreateSubscriptionResult
          >
        > => {
          return createSubscriptionWorkflow(
            {
              organization,
              product,
              price: defaultPrice,
              quantity: 1,
              livemode: true,
              startDate: new Date(),
              interval: IntervalUnit.Month,
              intervalCount: 1,
              defaultPaymentMethod: newPaymentMethod,
              customer: newCustomer,
              stripeSetupIntentId,
              autoStart: false, // Don't auto-start, which will create Incomplete status
            },
            transaction
          )
        }
      )

      const createdSubscription = workflowResult.result.subscription
      expect(createdSubscription.status).toBe(
        SubscriptionStatus.Incomplete
      )
      expect(workflowResult.ledgerCommand).toBeUndefined()
    })
  })
})
