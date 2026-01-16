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

import { Result } from 'better-result'
import { addDays, subDays } from 'date-fns'
import {
  setupBillingPeriod,
  setupPaymentMethod,
  setupPrice,
  setupProductFeature,
  setupResource,
  setupResourceFeature,
  setupSubscription,
  setupSubscriptionItem,
  setupToggleFeature,
  setupUsageCreditGrantFeature,
  setupUsageMeter,
} from '@/../seedDatabase'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
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
import type { UsageMeter } from '@/db/schema/usageMeters'
import { insertCustomer } from '@/db/tableMethods/customerMethods'
import { insertPricingModel } from '@/db/tableMethods/pricingModelMethods'
import { insertProduct } from '@/db/tableMethods/productMethods'
import { selectSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import {
  type AdjustSubscriptionResult,
  adjustSubscription,
} from '@/subscriptions/adjustSubscription'
import {
  BillingPeriodStatus,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  PriceType,
  SubscriptionAdjustmentTiming,
  SubscriptionStatus,
} from '@/types'
import core from '@/utils/core'
import { AdjustmentTimingDep } from '../dependencies/adjustmentTimingDependencies'
import { AdjustmentTypeDep } from '../dependencies/adjustmentTypeDependencies'
import { BillingIntervalDep } from '../dependencies/billingIntervalDependencies'
import { ProrationDep } from '../dependencies/prorationDependencies'
import { ResourceFeatureDep } from '../dependencies/resourceFeatureDependencies'
import { SubscriptionStatusDep } from '../dependencies/subscriptionStatusDependencies'
import { ToggleFeatureDep } from '../dependencies/toggleFeatureDependencies'
import { UsageCreditGrantFeatureDep } from '../dependencies/usageCreditGrantFeatureDependencies'
import { defineBehavior } from '../index'
import type { CompleteStripeOnboardingResult } from './stripeOnboardingBehaviors'

// ============================================================================
// Result Types
// ============================================================================

/**
 * Features that may be attached to a subscription based on dependencies.
 */
interface SubscriptionFeatures {
  /** Toggle feature, if present */
  toggleFeature: Feature.ToggleRecord | null
  toggleProductFeature: ProductFeature.Record | null
  /** Usage credit grant feature, if present */
  usageCreditGrantFeature: Feature.UsageCreditGrantRecord | null
  usageCreditGrantProductFeature: ProductFeature.Record | null
  usageMeter: UsageMeter.Record | null
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
 * - Features: Based on ToggleFeatureDep, UsageCreditGrantFeatureDep, ResourceFeatureDep
 */
export const setupSubscriptionBehavior = defineBehavior({
  name: 'setup subscription',
  dependencies: [
    SubscriptionStatusDep,
    ToggleFeatureDep,
    UsageCreditGrantFeatureDep,
    ResourceFeatureDep,
    BillingIntervalDep,
  ],
  run: async (
    {
      subscriptionStatusDep,
      toggleFeatureDep,
      usageCreditGrantFeatureDep,
      resourceFeatureDep,
      billingIntervalDep,
    },
    prev: CompleteStripeOnboardingResult
  ): Promise<SetupSubscriptionResult> => {
    const { organization } = prev
    const nanoid = core.nanoid()
    const livemode = true

    // Create pricing model
    const pricingModel = await adminTransaction(
      async ({ transaction }) => {
        return insertPricingModel(
          {
            name: `Test Pricing Model ${nanoid}`,
            organizationId: organization.id,
            livemode,
            isDefault: false,
          },
          transaction
        )
      },
      { livemode }
    )

    // Create product
    const product = await adminTransaction(
      async ({ transaction }) => {
        return insertProduct(
          {
            name: `Test Product ${nanoid}`,
            organizationId: organization.id,
            livemode,
            pricingModelId: pricingModel.id,
            active: true,
            slug: `test-product-${nanoid}`,
          },
          transaction
        )
      },
      { livemode }
    )

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
      toggleFeature: null,
      toggleProductFeature: null,
      usageCreditGrantFeature: null,
      usageCreditGrantProductFeature: null,
      usageMeter: null,
      resourceFeature: null,
      resourceProductFeature: null,
      resource: null,
    }

    // Create toggle feature if needed
    if (toggleFeatureDep.hasFeature) {
      const toggleFeature = (await setupToggleFeature({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: `Toggle Feature ${nanoid}`,
        livemode,
      })) as Feature.ToggleRecord
      features.toggleFeature = toggleFeature
      features.toggleProductFeature = await setupProductFeature({
        productId: product.id,
        featureId: toggleFeature.id,
        organizationId: organization.id,
      })
    }

    // Create usage credit grant feature if needed
    if (usageCreditGrantFeatureDep.hasFeature) {
      features.usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: `Usage Meter ${nanoid}`,
        livemode,
      })
      features.usageCreditGrantFeature =
        await setupUsageCreditGrantFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: `Usage Credit Grant ${nanoid}`,
          usageMeterId: features.usageMeter.id,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          livemode,
          amount: 1000,
        })
      features.usageCreditGrantProductFeature =
        await setupProductFeature({
          productId: product.id,
          featureId: features.usageCreditGrantFeature.id,
          organizationId: organization.id,
        })
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
    const customer = await adminTransaction(
      async ({ transaction }) => {
        return insertCustomer(
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
      },
      { livemode }
    )

    // Create payment method
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      livemode,
    })

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

    // Create subscription item
    await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: initialPrice.name ?? `Test Price ${nanoid}`,
      quantity: 1,
      unitPrice: initialPrice.unitPrice,
      priceId: initialPrice.id,
    })

    // Get subscription items
    const subscriptionItems = await adminTransaction(
      async ({ transaction }) => {
        return selectSubscriptionItems(
          { subscriptionId: subscription.id },
          transaction
        )
      },
      { livemode }
    )

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
    const {
      organization,
      pricingModel,
      initialPrice,
      features,
      billingPeriod,
    } = prev
    const nanoid = core.nanoid()
    const livemode = true

    // Calculate target price based on multiplier
    const targetUnitPrice = Math.round(
      initialPrice.unitPrice * adjustmentTypeDep.priceMultiplier
    )

    // Create target product
    const targetProduct = await adminTransaction(
      async ({ transaction }) => {
        return insertProduct(
          {
            name: `Target Product ${nanoid}`,
            organizationId: organization.id,
            livemode,
            pricingModelId: pricingModel.id,
            active: true,
            slug: `target-product-${nanoid}`,
          },
          transaction
        )
      },
      { livemode }
    )

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
      toggleFeature: null,
      toggleProductFeature: null,
      usageCreditGrantFeature: null,
      usageCreditGrantProductFeature: null,
      usageMeter: null,
      resourceFeature: null,
      resourceProductFeature: null,
      resource: null,
    }

    // Copy toggle feature to target product
    if (features.toggleFeature) {
      targetFeatures.toggleFeature = features.toggleFeature
      targetFeatures.toggleProductFeature = await setupProductFeature(
        {
          productId: targetProduct.id,
          featureId: features.toggleFeature.id,
          organizationId: organization.id,
        }
      )
    }

    // Copy usage credit grant feature to target product
    if (features.usageCreditGrantFeature) {
      targetFeatures.usageCreditGrantFeature =
        features.usageCreditGrantFeature
      targetFeatures.usageMeter = features.usageMeter
      targetFeatures.usageCreditGrantProductFeature =
        await setupProductFeature({
          productId: targetProduct.id,
          featureId: features.usageCreditGrantFeature.id,
          organizationId: organization.id,
        })
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
    // adjustSubscription requires TransactionEffectsContext, which comprehensiveAdminTransaction provides
    const adjustmentResult =
      await comprehensiveAdminTransaction<AdjustSubscriptionResult>(
        async (ctx) => {
          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment,
            },
            organization,
            ctx
          )
          return Result.ok(result)
        },
        { livemode }
      )

    return {
      ...prev,
      adjustmentResult,
    }
  },
})
