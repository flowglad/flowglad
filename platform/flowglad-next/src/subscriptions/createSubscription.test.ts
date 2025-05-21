import { describe, it, expect } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupSubscription,
  setupSubscriptionItem,
  setupBillingPeriod,
  setupBillingPeriodItems,
  setupTestFeaturesAndProductFeatures,
} from '../../seedDatabase'
import { createSubscriptionWorkflow } from './createSubscription'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  IntervalUnit,
  SubscriptionStatus,
  PriceType,
} from '@/types'
import { Price } from '@/db/schema/prices'
import { updateSubscription } from '@/db/tableMethods/subscriptionMethods'
import { selectBillingPeriodItems } from '@/db/tableMethods/billingPeriodItemMethods'
import { core } from '@/utils/core'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { FeatureType, FeatureUsageGrantFrequency } from '@/types'

describe('createSubscription', async () => {
  const { organization, product, price } = await setupOrg()
  const customer = await setupCustomer({
    organizationId: organization.id,
  })
  const paymentMethod = await setupPaymentMethod({
    organizationId: organization.id,
    customerId: customer.id,
  })
  const [
    { subscription, subscriptionItems, billingPeriod, billingRun },
  ] = await adminTransaction(async ({ transaction }) => {
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

  it('creates a subscription with correct priced items, and billing run', async () => {
    expect(subscription).toBeDefined()
    expect(
      subscriptionItems[0].unitPrice * subscriptionItems[0].quantity
    ).toBe(price.unitPrice * 1)
    expect(billingPeriod.status).toBe(BillingPeriodStatus.Active)
    expect(billingRun?.status).toBe(BillingRunStatus.Scheduled)
  })
  it('throws an error if the customer already has an active subscription', async () => {
    await adminTransaction(async ({ transaction }) => {
      await updateSubscription(
        {
          id: subscription.id,
          status: SubscriptionStatus.Active,
        },
        transaction
      )
    })
    const stripeSetupIntentId = `setupintent_${core.nanoid()}`
    await expect(
      adminTransaction(async ({ transaction }) => {
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
          },
          transaction
        )
      })
    ).rejects.toThrow()
  })
  it('does not throw an error if creating a subscription for a customer with no active subscriptions, but past non-active subscriptions', async () => {
    const newCustomer = await setupCustomer({
      organizationId: organization.id,
    })
    const newPaymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: newCustomer.id,
    })
    // Create a past subscription that is now canceled
    await adminTransaction(async ({ transaction }) => {
      const stripeSetupIntentId = `setupintent_${core.nanoid()}`
      const [sub] = await createSubscriptionWorkflow(
        {
          organization,
          product,
          price,
          quantity: 1,
          livemode: true,
          startDate: new Date('2023-01-01'),
          interval: IntervalUnit.Month,
          intervalCount: 1,
          defaultPaymentMethod: newPaymentMethod,
          customer: newCustomer,
          stripeSetupIntentId,
        },
        transaction
      )

      await updateSubscription(
        {
          id: sub.subscription.id,
          status: SubscriptionStatus.Canceled,
          canceledAt: new Date('2023-02-01'),
        },
        transaction
      )

      return sub
    })

    // Should be able to create a new subscription since the past one is canceled
    await expect(
      adminTransaction(async ({ transaction }) => {
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
            defaultPaymentMethod: newPaymentMethod,
            customer: newCustomer,
            stripeSetupIntentId: 'test-intent-id',
          },
          transaction
        )
      })
    ).resolves.toBeDefined()
  })
  it('creates billing periods correctly for trial subscriptions', async () => {
    const { organization, product, price } = await setupOrg()
    const newCustomer = await setupCustomer({
      organizationId: organization.id,
    })
    const newPaymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: newCustomer.id,
    })

    const startDate = new Date()
    const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const [{ subscription, billingPeriod }] = await adminTransaction(
      async ({ transaction }) => {
        const stripeSetupIntentId = `setupintent_${core.nanoid()}`
        return createSubscriptionWorkflow(
          {
            organization,
            product,
            price,
            quantity: 1,
            livemode: true,
            startDate,
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: newPaymentMethod,
            customer: newCustomer,
            trialEnd,
            stripeSetupIntentId,
          },
          transaction
        )
      }
    )

    // Verify subscription details
    expect(subscription.trialEnd?.getTime()).toBe(trialEnd.getTime())

    // Verify billing period was created
    expect(billingPeriod).toBeDefined()
    expect(billingPeriod.startDate.getTime()).toBe(
      startDate.getTime()
    )
    expect(billingPeriod.endDate.getTime()).toBe(trialEnd.getTime())

    // Verify no billing period items exist for trial period
    await adminTransaction(async ({ transaction }) => {
      const billingPeriodItems = await selectBillingPeriodItems(
        {
          billingPeriodId: billingPeriod.id,
        },
        transaction
      )
      expect(billingPeriodItems).toHaveLength(0)
    })
  })

  describe('price type behavior', () => {
    it('sets runBillingAtPeriodStart to false for usage price', async () => {
      const { organization, product } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })

      const usagePrice = {
        ...price,
        type: PriceType.Usage,
      } as Price.Record

      const [{ subscription }] = await adminTransaction(
        async ({ transaction }) => {
          const stripeSetupIntentId = `setupintent_${core.nanoid()}`
          return createSubscriptionWorkflow(
            {
              organization,
              product,
              price: usagePrice,
              quantity: 1,
              livemode: true,
              startDate: new Date(),
              interval: IntervalUnit.Month,
              intervalCount: 1,
              defaultPaymentMethod: paymentMethod,
              customer,
              stripeSetupIntentId,
            },
            transaction
          )
        }
      )

      expect(subscription.runBillingAtPeriodStart).toBe(false)
    })

    it('sets runBillingAtPeriodStart to true for subscription price', async () => {
      const { organization, product } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })

      const subscriptionPrice = {
        ...price,
        type: PriceType.Subscription,
      } as Price.Record

      const [{ subscription }] = await adminTransaction(
        async ({ transaction }) => {
          const stripeSetupIntentId = `setupintent_${core.nanoid()}`
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
            },
            transaction
          )
        }
      )

      expect(subscription.runBillingAtPeriodStart).toBe(true)
    })

    it('throws if price is not subscription type', async () => {
      const { organization, product } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })

      const singlePaymentPrice = {
        ...price,
        type: PriceType.SinglePayment,
      } as Price.Record

      await expect(
        adminTransaction(async ({ transaction }) => {
          const stripeSetupIntentId = `setupintent_${core.nanoid()}`
          return createSubscriptionWorkflow(
            {
              organization,
              product,
              price: singlePaymentPrice,
              quantity: 1,
              livemode: true,
              startDate: new Date(),
              interval: IntervalUnit.Month,
              intervalCount: 1,
              defaultPaymentMethod: paymentMethod,
              customer,
              stripeSetupIntentId,
            },
            transaction
          )
        })
      ).rejects.toThrow('Price is not a subscription')
    })
  })

  it("doesn't recreate subscriptions, billing periods, or billing period items for the same setup intent", async () => {
    const startDate = new Date()
    const newCustomer = await setupCustomer({
      organizationId: organization.id,
    })
    const newPaymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: newCustomer.id,
    })
    // Create initial subscription and capture first result
    const firstSubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: newCustomer.id,
      paymentMethodId: newPaymentMethod.id,
      priceId: price.id,
      interval: IntervalUnit.Month,
      intervalCount: 1,
      trialEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: SubscriptionStatus.Incomplete,
    })
    await setupSubscriptionItem({
      subscriptionId: firstSubscription.id,
      name: 'Test Item',
      quantity: 1,
      unitPrice: price.unitPrice,
    })
    const firstBillingPeriod = await setupBillingPeriod({
      subscriptionId: firstSubscription.id,
      startDate,
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    await setupBillingPeriodItems({
      billingPeriodId: firstBillingPeriod.id,
      quantity: 1,
      unitPrice: price.unitPrice,
    })

    // Store the first billing run
    const [firstResult] = await adminTransaction(
      async ({ transaction }) => {
        return createSubscriptionWorkflow(
          {
            organization,
            product,
            price,
            quantity: 1,
            livemode: true,
            startDate,
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: newPaymentMethod,
            customer: newCustomer,
            stripeSetupIntentId:
              firstSubscription.stripeSetupIntentId!,
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
            price,
            quantity: 1,
            livemode: true,
            startDate,
            interval: IntervalUnit.Month,
            intervalCount: 1,
            defaultPaymentMethod: newPaymentMethod,
            customer: newCustomer,
            stripeSetupIntentId:
              firstSubscription.stripeSetupIntentId!,
          },
          transaction
        )
      }
    )

    // Verify same subscription, billing period, and billing run returned
    expect(secondResult.subscription.id).toBe(firstSubscription.id)
    expect(secondResult.billingRun?.id).toBe(
      firstResult.billingRun?.id
    )
  })

  it('should NOT have a billingRun if no defaultPaymentMethod is provided and customer has no payment method', async () => {
    const { organization, product, price } = await setupOrg()
    const customerWithoutPaymentMethod = await setupCustomer({
      organizationId: organization.id,
    })

    const [{ subscription, billingPeriod, billingRun }] =
      await adminTransaction(async ({ transaction }) => {
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
            customer: customerWithoutPaymentMethod,
            stripeSetupIntentId,
          },
          transaction
        )
      })

    // Verify subscription and billing period were created
    expect(subscription).toBeDefined()
    expect(billingPeriod).toBeDefined()

    // Verify no billing run was created
    expect(billingRun).toBeNull()
  })

  it('should execute with a billingRun if customer has a default payment method but no defaultPaymentMethodId is provided', async () => {
    const { organization, product, price } = await setupOrg()
    const customerWithDefaultPaymentMethod = await setupCustomer({
      organizationId: organization.id,
    })

    // Create a payment method and set it as default for the customer
    const defaultPaymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customerWithDefaultPaymentMethod.id,
      default: true,
    })

    const [{ subscription, billingPeriod, billingRun }] =
      await adminTransaction(async ({ transaction }) => {
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
            customer: customerWithDefaultPaymentMethod,
            stripeSetupIntentId,
            autoStart: true,
          },
          transaction
        )
      })

    // Verify subscription and billing period were created
    expect(subscription).toBeDefined()
    expect(billingPeriod).toBeDefined()

    // Verify billing run was created with the customer's default payment method
    expect(billingRun).toBeDefined()
    expect(billingRun?.status).toBe(BillingRunStatus.Scheduled)
    expect(billingRun?.paymentMethodId).toBe(defaultPaymentMethod.id)
  })
})

describe('createSubscriptionWorkflow billing run creation', async () => {
  it('creates a billing run when price is subscription type and a default payment method exists', async () => {
    const { organization, product, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const subscriptionPrice = {
      ...price,
      type: PriceType.Subscription, // Ensure it's a subscription price
    } as Price.Record

    const [{ billingRun }] = await adminTransaction(
      async ({ transaction }) => {
        const stripeSetupIntentId = `setupintent_${core.nanoid()}`
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
            autoStart: true, // Important for active status and billing run
          },
          transaction
        )
      }
    )
    expect(billingRun).toBeDefined()
    expect(billingRun?.status).toBe(BillingRunStatus.Scheduled)
  })

  it('does NOT create a billing run when price is subscription type but no default payment method exists', async () => {
    const { organization, product, price } = await setupOrg()
    // Create a customer specifically for this test who will have no payment methods.
    const customerWithoutPM = await setupCustomer({
      organizationId: organization.id,
    })
    // Note: No paymentMethod is set up for customerWithoutPM.

    const subscriptionPrice = {
      ...price,
      type: PriceType.Subscription,
    } as Price.Record

    // Call the workflow.
    // Since customerWithoutPM has no payment methods in the DB, and defaultPaymentMethod is undefined,
    // maybeDefaultPaymentMethodForSubscription will return null, leading to no billing run.
    const [{ billingRun }] = await adminTransaction(
      async ({ transaction }) => {
        const stripeSetupIntentId = `setupintent_${core.nanoid()}`
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
            defaultPaymentMethod: undefined, // Explicitly pass undefined
            customer: customerWithoutPM, // Use the customer with no payment methods
            stripeSetupIntentId,
            autoStart: true,
          },
          transaction
        )
      }
    )
    expect(billingRun).toBeNull()
    // No vi.restoreAllMocks() is needed as no mocks were used.
  })

  it('does NOT create a billing run when price is usage-based, even if a default payment method exists', async () => {
    const { organization, product, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const usagePrice = {
      ...price,
      type: PriceType.Usage, // Usage-based price
    } as Price.Record

    const [{ billingRun }] = await adminTransaction(
      async ({ transaction }) => {
        const stripeSetupIntentId = `setupintent_${core.nanoid()}`
        return createSubscriptionWorkflow(
          {
            organization,
            product,
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
    expect(billingRun).toBeNull()
  })

  it('does NOT create a billing run when autoStart is false, even if price is subscription and payment method exists', async () => {
    const { organization, product, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const subscriptionPrice = {
      ...price,
      type: PriceType.Subscription,
    } as Price.Record

    const [{ billingRun, subscription }] = await adminTransaction(
      async ({ transaction }) => {
        const stripeSetupIntentId = `setupintent_${core.nanoid()}`
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
            autoStart: false,
          },
          transaction
        )
      }
    )
    expect(subscription.status).toBe(SubscriptionStatus.Incomplete)
    expect(billingRun).toBeNull()
  })
  it('does not create a billing run if autoStart is not provided', async () => {
    const { organization, product, price } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    const subscriptionPrice = {
      ...price,
      type: PriceType.Subscription,
    } as Price.Record

    const [{ billingRun, subscription }] = await adminTransaction(
      async ({ transaction }) => {
        const stripeSetupIntentId = `setupintent_${core.nanoid()}`
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
          },
          transaction
        )
      }
    )
    expect(subscription.status).toBe(SubscriptionStatus.Incomplete)
    expect(billingRun).toBeNull()
  })
})

describe('createSubscriptionWorkflow with SubscriptionItemFeatures', async () => {
  it('should create SubscriptionItemFeatures when a subscription is created for a product with features', async () => {
    const { organization, product, price, catalog } = await setupOrg()
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

    const [{ subscription, subscriptionItems }] =
      await adminTransaction(async ({ transaction }) => {
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
    const { organization, product, price, catalog } = await setupOrg() // Create org/product/price with livemode false
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

    const [{ subscription, subscriptionItems }] =
      await adminTransaction(async ({ transaction }) => {
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

    const [{ subscriptionItems }] = await adminTransaction(
      async ({ transaction }) => {
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
      }
    )

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
})
