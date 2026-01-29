/**
 * Subscription Adjustment Behaviors
 *
 * Behaviors representing subscription adjustment operations in Flowglad.
 *
 * ## Product Context
 *
 * Subscription adjustments allow customers to change their plan mid-billing period.
 * This includes upgrades (more expensive plan), downgrades (less expensive plan),
 * and lateral moves (same price, different features).
 *
 * ## User Journey
 *
 * After a customer has an active subscription, they may want to:
 * - Upgrade to a higher tier for more features
 * - Downgrade to save costs
 * - Switch plans with the same price but different features
 *
 * ## Behavior Chain
 *
 * 1. authenticateUserBehavior
 * 2. createOrganizationBehavior
 * 3. completeStripeOnboardingBehavior
 * 4. setupSubscriptionBehavior (creates subscription with initial items)
 * 5. setupTargetPriceBehavior (creates price to adjust to)
 * 6. adjustSubscriptionBehavior (calls adjustSubscription)
 */

// Note: Trigger.dev task mocking for behavior tests
// The mocks must be defined in the behavior TEST file (adjustSubscription.behavior.test.ts),
// not here, because vi.mock() hoisting only works within the test file that vitest processes.
// Mocks defined in imported modules are not hoisted correctly.

import { Result } from 'better-result'
import { addDays, subDays } from 'date-fns'
import {
  setupBillingPeriod,
  setupInvoice,
  setupPayment,
  setupPaymentMethod,
  setupPrice,
  setupProductFeature,
  setupResource,
  setupResourceFeature,
  setupResourceSubscriptionItemFeature,
  setupSubscription,
  setupSubscriptionItem,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Customer } from '@/db/schema/customers'
import type { Feature } from '@/db/schema/features'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { ProductFeature } from '@/db/schema/productFeatures'
import type { Product } from '@/db/schema/products'
import type { Resource } from '@/db/schema/resources'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import { insertCustomer } from '@/db/tableMethods/customerMethods'
import { selectDefaultPricingModel } from '@/db/tableMethods/pricingModelMethods'
import { insertProduct } from '@/db/tableMethods/productMethods'
import { selectSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import {
  type AdjustSubscriptionResult,
  adjustSubscription,
} from '@/subscriptions/adjustSubscription'
import {
  BillingPeriodStatus,
  IntervalUnit,
  InvoiceStatus,
  PaymentStatus,
  PriceType,
  SubscriptionAdjustmentTiming,
  SubscriptionStatus,
} from '@/types'
import core from '@/utils/core'
import { AdjustmentTimingDep } from '../dependencies/adjustmentTimingDependencies'
import { AdjustmentTypeDep } from '../dependencies/adjustmentTypeDependencies'
import { BillingIntervalDep } from '../dependencies/billingIntervalDependencies'
import { PaymentSimulationDep } from '../dependencies/paymentSimulationDependencies'
import { ProrationDep } from '../dependencies/prorationDependencies'
import { ResourceFeatureDep } from '../dependencies/resourceFeatureDependencies'
import { SubscriptionStatusDep } from '../dependencies/subscriptionStatusDependencies'
import { defineBehavior } from '../index'
import type { CompleteStripeOnboardingResult } from './stripeOnboardingBehaviors'

// ============================================================================
// Result Types
// ============================================================================

/**
 * Features that may be attached to a subscription based on dependencies.
 */
interface SubscriptionFeatures {
  /** Resource feature, if present */
  resourceFeature: Feature.ResourceRecord | null
  resourceProductFeature: ProductFeature.Record | null
  resource: Resource.Record | null
}

/**
 * Result of setting up a subscription for adjustment testing.
 */
export interface SetupSubscriptionResult
  extends CompleteStripeOnboardingResult {
  /** The pricing model for the subscription */
  pricingModel: PricingModel.Record
  /** The product for the subscription */
  product: Product.Record
  /** The initial price (before adjustment) */
  initialPrice: Price.Record
  /** The customer who owns the subscription */
  customer: Customer.Record
  /** The payment method for the subscription */
  paymentMethod: PaymentMethod.Record
  /** The subscription to be adjusted */
  subscription: Subscription.StandardRecord
  /** The current billing period */
  billingPeriod: BillingPeriod.Record
  /** Initial subscription items */
  subscriptionItems: SubscriptionItem.Record[]
  /** Features attached to the subscription */
  features: SubscriptionFeatures
}

/**
 * Result of setting up the target price for adjustment.
 */
export interface SetupTargetPriceResult
  extends SetupSubscriptionResult {
  /** The price to adjust to (target) */
  targetPrice: Price.Record
  /** Target product (may be different from initial) */
  targetProduct: Product.Record
  /** Target features for the new price */
  targetFeatures: SubscriptionFeatures
}

/**
 * Result of adjusting the subscription.
 */
export interface AdjustSubscriptionBehaviorResult
  extends SetupTargetPriceResult {
  /** The result of the adjustSubscription call */
  adjustmentResult: AdjustSubscriptionResult
}

// ============================================================================
// Behaviors
// ============================================================================

/**
 * Setup Subscription Behavior
 *
 * Creates a subscription with the appropriate status, billing interval,
 * and features based on the dependency configuration.
 *
 * ## What Gets Created
 *
 * - PricingModel: For price and feature organization
 * - Product: Container for the price
 * - Price: With appropriate interval settings
 * - Customer: To own the subscription
 * - PaymentMethod: For billing
 * - Subscription: In the appropriate status
 * - BillingPeriod: Current active billing period
 * - SubscriptionItems: Initial items for the subscription
 * - Features: Based on ResourceFeatureDep (resource features only)
 */
export const setupSubscriptionBehavior = defineBehavior({
  name: 'setup subscription',
  dependencies: [
    SubscriptionStatusDep,
    ResourceFeatureDep,
    BillingIntervalDep,
    PaymentSimulationDep,
  ],
  run: async (
    {
      subscriptionStatusDep,
      resourceFeatureDep,
      billingIntervalDep,
      paymentSimulationDep,
    },
    prev: CompleteStripeOnboardingResult
  ): Promise<SetupSubscriptionResult> => {
    const { organization } = prev
    const nanoid = core.nanoid()
    const livemode = true

    // Get the existing default livemode pricing model for the organization
    // The pricing model is created during organization setup (createOrganizationBehavior)
    const pricingModel = (
      await adminTransaction(
        async ({ transaction }) => {
          const existingModel = await selectDefaultPricingModel(
            { organizationId: organization.id, livemode },
            transaction
          )
          if (!existingModel) {
            throw new Error(
              `No default livemode pricing model found for organization ${organization.id}. ` +
                'This should have been created during organization setup.'
            )
          }
          return Result.ok(existingModel)
        },
        { livemode }
      )
    ).unwrap()

    // Create product - use adminTransaction to get full context
    const product = (
      await adminTransaction(
        async (ctx) => {
          const result = await insertProduct(
            {
              name: `Test Product ${nanoid}`,
              organizationId: organization.id,
              livemode,
              pricingModelId: pricingModel.id,
              active: true,
              slug: `test-product-${nanoid}`,
            },
            ctx
          )
          return Result.ok(result)
        },
        { livemode }
      )
    ).unwrap()

    // Create initial price with billing interval from dependency
    const initialPrice = await setupPrice({
      productId: product.id,
      name: `Initial Price ${nanoid}`,
      type: PriceType.Subscription,
      unitPrice: 10000, // $100/period
      livemode,
      isDefault: true,
      intervalUnit: billingIntervalDep.intervalUnit,
      intervalCount: billingIntervalDep.intervalCount,
    })

    // Create features based on dependencies
    const features: SubscriptionFeatures = {
      resourceFeature: null,
      resourceProductFeature: null,
      resource: null,
    }

    // Create resource feature if needed
    if (resourceFeatureDep.hasFeature) {
      // First create a Resource that the feature will represent
      features.resource = await setupResource({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: `Resource ${nanoid}`,
      })
      features.resourceFeature = await setupResourceFeature({
        organizationId: organization.id,
        name: `Resource Feature ${nanoid}`,
        resourceId: features.resource.id,
        livemode,
        amount: 5,
      })
      features.resourceProductFeature = await setupProductFeature({
        productId: product.id,
        featureId: features.resourceFeature.id,
        organizationId: organization.id,
      })
    }

    // Create customer
    const customer = (
      await adminTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await insertCustomer(
              {
                email: `customer-${nanoid}@test.flowglad.com`,
                name: `Test Customer ${nanoid}`,
                organizationId: organization.id,
                livemode,
                externalId: `external-${nanoid}`,
                pricingModelId: pricingModel.id,
              },
              transaction
            )
          )
        },
        { livemode }
      )
    ).unwrap()

    // Create payment method
    const paymentMethod = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
        livemode,
      })
    ).unwrap()

    // Calculate billing period dates (centered around now)
    const now = new Date()
    const periodStart = subDays(now, 15)
    const periodEnd = addDays(now, 15)

    // Create subscription with appropriate status
    const subscription = (await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: initialPrice.id,
      interval: billingIntervalDep.intervalUnit,
      intervalCount: billingIntervalDep.intervalCount,
      status: subscriptionStatusDep.status,
      currentBillingPeriodStart: periodStart.getTime(),
      currentBillingPeriodEnd: periodEnd.getTime(),
      livemode,
      renews: true,
      trialEnd:
        subscriptionStatusDep.status === SubscriptionStatus.Trialing
          ? addDays(now, 7).getTime()
          : undefined,
    })) as Subscription.StandardRecord

    // Create billing period
    const billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: periodStart,
      endDate: periodEnd,
      status: BillingPeriodStatus.Active,
      livemode,
    })

    // Optionally create invoice and payment for the billing period
    // This simulates the initial subscription payment, which is needed for
    // proration calculations during adjustments (especially downgrades)
    if (paymentSimulationDep.createPayment) {
      const invoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Paid,
        livemode,
        priceId: initialPrice.id,
      })

      // Create a succeeded payment for the full subscription amount
      await setupPayment({
        stripeChargeId: `ch_test_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: initialPrice.unitPrice,
        livemode,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        billingPeriodId: billingPeriod.id,
        subscriptionId: subscription.id,
        paymentMethodId: paymentMethod.id,
      })
    }

    // Create subscription item
    const subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: initialPrice.name ?? `Test Price ${nanoid}`,
      quantity: 1,
      unitPrice: initialPrice.unitPrice,
      priceId: initialPrice.id,
    })

    // Create subscription item features for resource features
    // This is needed for resource claims to work correctly
    if (
      features.resourceFeature &&
      features.resource &&
      features.resourceProductFeature
    ) {
      await setupResourceSubscriptionItemFeature({
        subscriptionItemId: subscriptionItem.id,
        featureId: features.resourceFeature.id,
        resourceId: features.resource.id,
        pricingModelId: pricingModel.id,
        productFeatureId: features.resourceProductFeature.id,
        amount: features.resourceFeature.amount,
      })
    }

    // Get subscription items
    const subscriptionItems = (
      await adminTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await selectSubscriptionItems(
              { subscriptionId: subscription.id },
              transaction
            )
          )
        },
        { livemode }
      )
    ).unwrap()

    return {
      ...prev,
      pricingModel,
      product,
      initialPrice,
      customer,
      paymentMethod,
      subscription,
      billingPeriod,
      subscriptionItems,
      features,
    }
  },
})

/**
 * Setup Target Price Behavior
 *
 * Creates the target price for the adjustment based on the adjustment type.
 *
 * ## Price Multiplier
 *
 * - Upgrade (2x): Target price is double the initial price
 * - Downgrade (0.5x): Target price is half the initial price
 * - Lateral (1x): Target price is the same as initial price
 */
export const setupTargetPriceBehavior = defineBehavior({
  name: 'setup target price',
  dependencies: [AdjustmentTypeDep],
  run: async (
    { adjustmentTypeDep },
    prev: SetupSubscriptionResult
  ): Promise<SetupTargetPriceResult> => {
    const { organization, pricingModel, initialPrice, features } =
      prev
    const nanoid = core.nanoid()
    const livemode = true

    // Calculate target price based on multiplier
    const targetUnitPrice = Math.round(
      initialPrice.unitPrice * adjustmentTypeDep.priceMultiplier
    )

    // Create target product - use adminTransaction to get full context
    const targetProduct = (
      await adminTransaction(
        async (ctx) => {
          const result = await insertProduct(
            {
              name: `Target Product ${nanoid}`,
              organizationId: organization.id,
              livemode,
              pricingModelId: pricingModel.id,
              active: true,
              slug: `target-product-${nanoid}`,
            },
            ctx
          )
          return Result.ok(result)
        },
        { livemode }
      )
    ).unwrap()

    // Create target price
    const targetPrice = await setupPrice({
      productId: targetProduct.id,
      name: `Target Price ${nanoid}`,
      type: PriceType.Subscription,
      unitPrice: targetUnitPrice,
      livemode,
      isDefault: false,
      intervalUnit: initialPrice.intervalUnit ?? IntervalUnit.Month,
      intervalCount: initialPrice.intervalCount ?? 1,
    })

    // Create matching features for target product if they exist on source
    const targetFeatures: SubscriptionFeatures = {
      resourceFeature: null,
      resourceProductFeature: null,
      resource: null,
    }

    // Copy resource feature to target product
    if (features.resourceFeature) {
      targetFeatures.resourceFeature = features.resourceFeature
      targetFeatures.resource = features.resource
      targetFeatures.resourceProductFeature =
        await setupProductFeature({
          productId: targetProduct.id,
          featureId: features.resourceFeature.id,
          organizationId: organization.id,
        })
    }

    return {
      ...prev,
      targetPrice,
      targetProduct,
      targetFeatures,
    }
  },
})

/**
 * Adjust Subscription Behavior
 *
 * Calls adjustSubscription with the appropriate timing and proration settings.
 *
 * ## Timing Resolution
 *
 * - Immediately: Changes take effect right now
 * - AtEndOfCurrentBillingPeriod: Changes take effect at period end
 * - Auto: System determines based on upgrade vs downgrade
 */
export const adjustSubscriptionBehavior = defineBehavior({
  name: 'adjust subscription',
  dependencies: [AdjustmentTimingDep, ProrationDep],
  run: async (
    { adjustmentTimingDep, prorationDep },
    prev: SetupTargetPriceResult
  ): Promise<AdjustSubscriptionBehaviorResult> => {
    const { organization, subscription, targetPrice } = prev
    const livemode = true

    // Build adjustment input based on timing
    let adjustment:
      | {
          timing: typeof SubscriptionAdjustmentTiming.Immediately
          newSubscriptionItems: Array<{
            priceId: string
            quantity: number
          }>
          prorateCurrentBillingPeriod: boolean
        }
      | {
          timing: typeof SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
          newSubscriptionItems: Array<{
            priceId: string
            quantity: number
          }>
        }
      | {
          timing: typeof SubscriptionAdjustmentTiming.Auto
          newSubscriptionItems: Array<{
            priceId: string
            quantity: number
          }>
          prorateCurrentBillingPeriod: boolean
        }

    if (
      adjustmentTimingDep.timing ===
      SubscriptionAdjustmentTiming.Immediately
    ) {
      adjustment = {
        timing: SubscriptionAdjustmentTiming.Immediately,
        newSubscriptionItems: [
          { priceId: targetPrice.id, quantity: 1 },
        ],
        prorateCurrentBillingPeriod:
          prorationDep.prorateCurrentBillingPeriod,
      }
    } else if (
      adjustmentTimingDep.timing ===
      SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
    ) {
      adjustment = {
        timing:
          SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
        newSubscriptionItems: [
          { priceId: targetPrice.id, quantity: 1 },
        ],
      }
    } else {
      adjustment = {
        timing: SubscriptionAdjustmentTiming.Auto,
        newSubscriptionItems: [
          { priceId: targetPrice.id, quantity: 1 },
        ],
        prorateCurrentBillingPeriod:
          prorationDep.prorateCurrentBillingPeriod,
      }
    }

    // Call adjustSubscription within a transaction
    // adjustSubscription requires TransactionEffectsContext, which adminTransaction provides
    // Note: adjustSubscription returns Result<AdjustSubscriptionResult, Error> so we return it directly
    const adjustmentResult = (
      await adminTransaction<AdjustSubscriptionResult>(
        async (ctx) => {
          return adjustSubscription(
            {
              id: subscription.id,
              adjustment,
            },
            organization,
            ctx
          )
        },
        { livemode }
      )
    ).unwrap()

    return {
      ...prev,
      adjustmentResult,
    }
  },
})
