import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupSubscription,
  setupSubscriptionItem,
  setupBillingPeriod,
  setupBillingPeriodItems,
  setupUsageMeter,
  setupPrice,
} from '../../seedDatabase'
import { createSubscriptionWorkflow } from './createSubscription'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  IntervalUnit,
  SubscriptionStatus,
  PriceType,
  CurrencyCode,
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

describe('createSubscription', async () => {
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
    const workflowResult = await adminTransaction(
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
    subscription = workflowResult[0].subscription
    subscriptionItems = workflowResult[0].subscriptionItems
    billingPeriod = workflowResult[0].billingPeriod
    billingRun = workflowResult[0].billingRun
  })

  it('creates a subscription with correct priced items, and billing run', async () => {
    expect(subscription).toBeDefined()
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
      const [subPast] = await createSubscriptionWorkflow(
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
          id: subPast.subscription.id,
          status: SubscriptionStatus.Canceled,
          canceledAt: new Date('2023-02-01'),
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

    const startDate = new Date()
    const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const stripeSetupIntentIdTrial = `setupintent_trial_${core.nanoid()}`

    const [
      {
        subscription: trialSubscription,
        billingPeriod: trialBillingPeriod,
      },
    ] = await adminTransaction(async ({ transaction }) => {
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

    expect(trialSubscription.trialEnd?.getTime()).toBe(
      trialEnd.getTime()
    )
    expect(trialBillingPeriod).toBeDefined()
    expect(trialBillingPeriod.startDate.getTime()).toBe(
      startDate.getTime()
    )
    expect(trialBillingPeriod.endDate.getTime()).toBe(
      trialEnd.getTime()
    )

    await adminTransaction(async ({ transaction }) => {
      const billingPeriodItems = await selectBillingPeriodItems(
        {
          billingPeriodId: trialBillingPeriod.id,
        },
        transaction
      )
      expect(billingPeriodItems).toHaveLength(0)
    })
  })

  describe('price type behavior', () => {
    // This nested describe can use `organization`, `product` from the outer scope's beforeEach.
    // It will set up its own customer and paymentMethod per test for clarity, or have its own beforeEach.

    it('sets runBillingAtPeriodStart to false for usage price', async () => {
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
        catalogId: product.catalogId,
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
        setupFeeAmount: 0,
        currency: CurrencyCode.USD,
        usageMeterId: usageMeter.id,
      })

      const [{ subscription: usageSubscription }] =
        await adminTransaction(async ({ transaction }) => {
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
      expect(usageSubscription.runBillingAtPeriodStart).toBe(false)
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
      const [{ subscription: subTypeSubscription }] =
        await adminTransaction(async ({ transaction }) => {
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

    it('throws if price is not subscription type', async () => {
      const singlePayCustomer = await setupCustomer({
        organizationId: organization.id,
      })
      const singlePayPaymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: singlePayCustomer.id,
      })

      const singlePaymentPrice = await setupPrice({
        productId: product.id,
        type: PriceType.SinglePayment,
        name: 'Single Payment Price',
        unitPrice: 100,
        livemode: true,
        isDefault: false,
        setupFeeAmount: 0,
        /**
         * TODO: clean up function signature
         */
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          const stripeSetupIntentIdSingle = `setupintent_single_pay_${core.nanoid()}`
          return createSubscriptionWorkflow(
            {
              organization,
              product,
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
  })

  it("doesn't recreate subscriptions, billing periods, or billing period items for the same setup intent", async () => {
    // This test has specific setup requirements for an INCOMPLETE subscription first.
    const startDate = new Date()
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
      trialEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
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
    await setupBillingPeriodItems({
      billingPeriodId: firstBillingPeriod.id,
      quantity: 1,
      unitPrice: defaultPrice.unitPrice,
    })

    // Store the first billing run
    const [firstResult] = await adminTransaction(
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
    const [secondResult] = await adminTransaction(
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

    const [{ billingRun: noPmBillingRun }] = await adminTransaction(
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
            customer: customerWithoutPM,
            stripeSetupIntentId: stripeSetupIntentIdNoPM,
            // defaultPaymentMethod is omitted
            // autoStart can be true or false, outcome should be no billing run
          },
          transaction
        )
      }
    )
    expect(noPmBillingRun).toBeNull()
  })

  it('should execute with a billingRun if customer has a default payment method but no defaultPaymentMethodId is provided', async () => {
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

    const [{ billingRun: custPmBillingRun }] = await adminTransaction(
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
            customer: customerWithDefaultPM,
            stripeSetupIntentId: stripeSetupIntentIdCustPM,
            // defaultPaymentMethod is omitted in params to createSubscriptionWorkflow
            autoStart: true, // Important for billing run creation
          },
          transaction
        )
      }
    )
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

    const [{ billingRun }] = await adminTransaction(
      async ({ transaction }) => {
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
      }
    )
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

    const [{ billingRun }] = await adminTransaction(
      async ({ transaction }) => {
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
      }
    )
    expect(billingRun).toBeNull()
  })

  it('does NOT create a billing run when price is usage-based, even if a default payment method exists', async () => {
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    // For usage price, we might need to update it if default is subscription.
    // Or, if setupOrg can provide a usage price, that would be cleaner.
    // Assuming we need to make it a usage price from defaultPriceForBillingRunTests:
    const usagePriceData: Price.Update = {
      ...defaultPriceForBillingRunTests,
      id: defaultPriceForBillingRunTests.id,
      type: PriceType.Usage,
      usageMeterId: (
        await setupUsageMeter({
          organizationId: organization.id,
          catalogId: product.catalogId,
          name: 'Temp Usage Meter',
        })
      ).id, // Requires a usage meter
      // Reset fields that might conflict with usage type if they were for subscription
      intervalUnit: undefined,
      intervalCount: undefined,
      trialPeriodDays: null,
      setupFeeAmount: null,
    }
    const usagePrice = await adminTransaction(
      async ({ transaction }) =>
        updatePrice(usagePriceData, transaction)
    )

    const [{ billingRun }] = await adminTransaction(
      async ({ transaction }) => {
        const stripeSetupIntentId = `setupintent_br_usage_${core.nanoid()}`
        return createSubscriptionWorkflow(
          {
            organization,
            product,
            price: usagePrice, // Use the updated usage price
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
      }
    )
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

    const [{ billingRun, subscription }] = await adminTransaction(
      async ({ transaction }) => {
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
      }
    )
    expect(subscription.status).toBe(SubscriptionStatus.Incomplete)
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

    const [{ billingRun, subscription }] = await adminTransaction(
      async ({ transaction }) => {
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
      }
    )
    expect(subscription.status).toBe(SubscriptionStatus.Incomplete)
    expect(billingRun).toBeNull()
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

  it('creates ledger accounts when the price is a usage price', async () => {
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      catalogId: defaultProduct.catalogId,
      name: 'Test Usage Meter for Ledger Account',
    })

    const [{ subscription }] = await adminTransaction(
      async ({ transaction }) => {
        const usagePriceUpdatePayload: Price.Update = {
          ...defaultSubscriptionPrice,
          id: defaultSubscriptionPrice.id,
          type: PriceType.Usage,
          usageMeterId: usageMeter.id,
          name: `${defaultSubscriptionPrice.name} (Usage)`,
          trialPeriodDays: null,
          setupFeeAmount: null,
          intervalUnit: undefined,
          intervalCount: undefined,
        }

        const usagePrice = await updatePrice(
          usagePriceUpdatePayload,
          transaction
        )
        const stripeSetupIntentId = `setupintent_ledger_usage_${core.nanoid()}`
        return createSubscriptionWorkflow(
          {
            organization,
            product: defaultProduct,
            price: usagePrice,
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
      }
    )

    const ledgerAccounts = await adminTransaction(
      async ({ transaction }) => {
        return selectLedgerAccounts(
          { subscriptionId: subscription.id },
          transaction
        )
      }
    )

    expect(ledgerAccounts.length).toBeGreaterThan(0)
    const accountForMeter = ledgerAccounts.find(
      (acc) => acc.usageMeterId === usageMeter.id
    )
    expect(accountForMeter).toBeDefined()
    expect(accountForMeter?.subscriptionId).toBe(subscription.id)
  })

  it('does NOT create ledger accounts when the price is not a usage price (e.g., subscription type)', async () => {
    // Pre-condition check for the default price from setupOrg (now from beforeEach)
    expect(defaultSubscriptionPrice.type).not.toBe(PriceType.Usage)
    expect(defaultSubscriptionPrice.usageMeterId).toBeNull()

    const [{ subscription }] = await adminTransaction(
      async ({ transaction }) => {
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
      }
    )

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
