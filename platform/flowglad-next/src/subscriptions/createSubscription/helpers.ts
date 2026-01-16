import { Result } from 'better-result'
import { eq } from 'drizzle-orm'
import type { BillingPeriodTransitionPayload } from '@/db/ledgerManager/ledgerManagerTypes'
import {
  type BillingPeriodItem,
  billingPeriodItems as billingPeriodItemsTable,
} from '@/db/schema/billingPeriodItems'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { BillingRun } from '@/db/schema/billingRuns'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import {
  bulkInsertBillingPeriodItems,
  selectBillingPeriodAndItemsByBillingPeriodWhere,
} from '@/db/tableMethods/billingPeriodItemMethods'
import { selectBillingRuns } from '@/db/tableMethods/billingRunMethods'
import { bulkInsertLedgerAccountsBySubscriptionIdAndUsageMeterId } from '@/db/tableMethods/ledgerAccountMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPaymentMethods } from '@/db/tableMethods/paymentMethodMethods'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import {
  currentSubscriptionStatuses,
  selectSubscriptions,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import type {
  DbTransaction,
  TransactionEffectsContext,
} from '@/db/types'
import { calculateSplitInBillingPeriodBasedOnAdjustmentDate } from '@/subscriptions/adjustSubscription'
import { attemptBillingRunTask } from '@/trigger/attempt-billing-run'
import {
  FeatureType,
  IntervalUnit,
  NormalBalanceType,
  PriceType,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@/types'
import core from '@/utils/core'
import { generateNextBillingPeriod } from '../billingIntervalHelpers'
import { createBillingPeriodAndItems } from '../billingPeriodHelpers'
import { createBillingRun } from '../billingRunHelpers'
import type {
  CreateSubscriptionParams,
  NonRenewingCreateSubscriptionResult,
  StandardCreateSubscriptionResult,
} from './types'

export const deriveSubscriptionStatus = ({
  autoStart,
  trialEnd,
  defaultPaymentMethodId,
  isDefaultPlan,
  doNotCharge,
}: {
  autoStart: boolean
  trialEnd?: Date | number
  defaultPaymentMethodId?: string
  isDefaultPlan: boolean
  doNotCharge?: boolean
}):
  | SubscriptionStatus.Trialing
  | SubscriptionStatus.Active
  | SubscriptionStatus.Incomplete => {
  // doNotCharge takes precedence over trial - if free, no trial needed
  if (doNotCharge && autoStart) {
    return SubscriptionStatus.Active
  }
  if (doNotCharge && !autoStart) {
    return SubscriptionStatus.Incomplete
  }
  // Trial can start even if autoStart is false
  if (trialEnd) {
    return SubscriptionStatus.Trialing
  }
  if (!autoStart) {
    return SubscriptionStatus.Incomplete
  }
  if (autoStart && defaultPaymentMethodId) {
    return SubscriptionStatus.Active
  }
  // Default plans are always active
  if (isDefaultPlan) {
    return SubscriptionStatus.Active
  }
  return SubscriptionStatus.Incomplete
}

/**
 * Creates prorated billing period items when upgrading mid-cycle
 * @param subscriptionItems The subscription items to prorate
 * @param billingPeriod The billing period
 * @param upgradeDate The date of the upgrade
 * @returns Array of prorated billing period items
 */
export const createProratedBillingPeriodItems = (
  subscriptionItems: SubscriptionItem.Record[],
  billingPeriod: BillingPeriod.Record,
  upgradeDate: Date | number
): BillingPeriodItem.Insert[] => {
  // Skip if upgrade date is at period start (no proration needed)
  if (new Date(upgradeDate).getTime() === billingPeriod.startDate) {
    return []
  }

  const split = calculateSplitInBillingPeriodBasedOnAdjustmentDate(
    upgradeDate,
    billingPeriod
  )

  return subscriptionItems.map((item) => ({
    billingPeriodId: billingPeriod.id,
    quantity: item.quantity,
    unitPrice: Math.round(item.unitPrice * split.afterPercentage),
    name: `Prorated: ${item.name}`,
    description: `Prorated charge for ${(split.afterPercentage * 100).toFixed(1)}% of billing period (${new Date(upgradeDate).toISOString().split('T')[0]} to ${new Date(billingPeriod.endDate).toISOString().split('T')[0]})`,
    livemode: item.livemode,
    type: SubscriptionItemType.Static,
    usageMeterId: null,
    usageEventsPerUnit: null,
    discountRedemptionId: null,
  }))
}

export const safelyProcessCreationForExistingSubscription = async (
  params: CreateSubscriptionParams,
  subscription: Subscription.Record,
  subscriptionItems: SubscriptionItem.Record[],
  transaction: DbTransaction
): Promise<
  Result<
    | StandardCreateSubscriptionResult
    | NonRenewingCreateSubscriptionResult,
    Error
  >
> => {
  if (subscription.renews === false) {
    return Result.ok({
      type: 'non_renewing',
      subscription,
      subscriptionItems,
      billingPeriod: null,
      billingPeriodItems: null,
      billingRun: null,
    })
  }

  const billingPeriodAndItems =
    await selectBillingPeriodAndItemsByBillingPeriodWhere(
      {
        subscriptionId: subscription.id,
      },
      transaction
    )
  if (!billingPeriodAndItems) {
    throw new Error('Billing period and items not found')
  }
  const { billingPeriod } = billingPeriodAndItems
  const [existingBillingRun] = await selectBillingRuns(
    {
      billingPeriodId: billingPeriod.id,
    },
    transaction
  )
  /**
   * If the subscription is set to run billing at period start,
   * we schedule the billing run for the start of the billing period.
   * Otherwise, we schedule the billing run for the end of the billing period.
   */
  const scheduledFor = subscription.runBillingAtPeriodStart
    ? subscription.currentBillingPeriodStart!
    : subscription.currentBillingPeriodEnd!

  const billingRun: BillingRun.Record | undefined =
    existingBillingRun ??
    (params.defaultPaymentMethod
      ? await createBillingRun(
          {
            billingPeriod,
            paymentMethod: params.defaultPaymentMethod,
            scheduledFor,
          },
          transaction
        )
      : undefined)
  /**
   * Billing timing depends on the price type:
   * - For subscription prices: billing runs at period start
   * - For usage-based prices: billing runs at period end
   */
  if (subscription.runBillingAtPeriodStart && !core.IS_TEST) {
    await attemptBillingRunTask.trigger({
      billingRun,
    })
  }
  return Result.ok({
    type: 'standard',
    subscription,
    subscriptionItems,
    billingPeriod: billingPeriodAndItems.billingPeriod,
    billingPeriodItems: billingPeriodAndItems.billingPeriodItems,
    billingRun,
  })
}

export const verifyCanCreateSubscription = async (
  params: CreateSubscriptionParams,
  transaction: DbTransaction
) => {
  const {
    customer,
    defaultPaymentMethod,
    backupPaymentMethod,
    price,
  } = params
  const currentSubscriptionsForCustomer = await selectSubscriptions(
    {
      customerId: customer.id,
      status: currentSubscriptionStatuses,
    },
    transaction
  )
  // if (
  //   stripeSetupIntentId &&
  //   currentSubscriptionsForCustomer.some(
  //     (subscription) => subscription.setupIntent === stripeSetupIntentId
  //   )
  // ) {
  //   return false
  // }

  // Check for single free subscription constraint
  // A subscription is considered free if the price.unitPrice is 0
  const isCreatingFreeSubscription = price.unitPrice === 0
  if (isCreatingFreeSubscription) {
    const activeFreeSubscriptions =
      currentSubscriptionsForCustomer.filter(
        (sub) => sub.isFreePlan === true
      )
    if (activeFreeSubscriptions.length > 0) {
      throw new Error(
        `Customer ${customer.id} already has an active free subscription. ` +
          `Only one free subscription is allowed per customer. ` +
          `Please upgrade or cancel the existing free subscription before creating a new one.`
      )
    }
  }

  if (currentSubscriptionsForCustomer.length > 0) {
    const organization = await selectOrganizationById(
      customer.organizationId,
      transaction
    )
    if (!organization.allowMultipleSubscriptionsPerCustomer) {
      throw new Error(
        `Customer ${customer.id} already has an active subscription. Please cancel the existing subscription before creating a new one.`
      )
    }
  }
  if (
    defaultPaymentMethod &&
    customer.id !== defaultPaymentMethod.customerId
  ) {
    throw new Error(
      `Customer ${customer.id} does not match default payment method ${defaultPaymentMethod.customerId}`
    )
  }
  if (
    backupPaymentMethod &&
    customer.id !== backupPaymentMethod.customerId
  ) {
    throw new Error(
      `Customer ${customer.id} does not match backup payment method ${backupPaymentMethod.customerId}`
    )
  }
}

export const maybeDefaultPaymentMethodForSubscription = async (
  params: {
    customerId: string
    defaultPaymentMethod?: PaymentMethod.Record | null
  },
  transaction: DbTransaction
) => {
  if (params.defaultPaymentMethod) {
    return params.defaultPaymentMethod
  }
  const paymentMethods = await selectPaymentMethods(
    {
      customerId: params.customerId,
    },
    transaction
  )
  if (paymentMethods.length === 0) {
    return null
  }
  const defaultPaymentMethod = paymentMethods.find(
    (paymentMethod) => paymentMethod.default
  )
  return defaultPaymentMethod
    ? defaultPaymentMethod
    : paymentMethods[0]
}

export const activateSubscription = async (
  params: {
    subscription: Subscription.Record
    subscriptionItems: SubscriptionItem.Record[]
    defaultPaymentMethod?: PaymentMethod.Record
    autoStart: boolean
  },
  ctx: TransactionEffectsContext
) => {
  const { transaction } = ctx
  const { subscription, subscriptionItems, defaultPaymentMethod } =
    params
  const { startDate, endDate } = generateNextBillingPeriod({
    interval: subscription.interval ?? IntervalUnit.Month,
    intervalCount: subscription.intervalCount ?? 1,
    billingCycleAnchorDate:
      subscription.billingCycleAnchorDate ??
      subscription.startDate ??
      new Date(),
    lastBillingPeriodEndDate: subscription.currentBillingPeriodEnd,
    subscriptionStartDate: subscription.startDate ?? undefined,
  })

  const price = await selectPriceById(
    subscription.priceId!,
    transaction
  )
  const renews = price.type === PriceType.Subscription ? true : false
  let subscriptionUpdate: Subscription.Update | null = null

  if (renews) {
    const renewingUpdate: Subscription.StandardUpdate = {
      id: subscription.id,
      status: SubscriptionStatus.Active,
      currentBillingPeriodStart: startDate,
      currentBillingPeriodEnd: endDate,
      billingCycleAnchorDate: startDate,
      defaultPaymentMethodId: defaultPaymentMethod?.id,
      interval: subscription.interval ?? IntervalUnit.Month,
      intervalCount: subscription.intervalCount ?? 1,
      renews: true,
    }
    subscriptionUpdate = renewingUpdate
  } else {
    const nonRenewingUpdate: Subscription.NonRenewingUpdate = {
      id: subscription.id,
      status: SubscriptionStatus.Active,
      currentBillingPeriodEnd: null,
      currentBillingPeriodStart: null,
      billingCycleAnchorDate: null,
      interval: null,
      intervalCount: null,
      renews: false,
    }
    subscriptionUpdate = nonRenewingUpdate
  }
  const activatedSubscription = await updateSubscription(
    subscriptionUpdate,
    transaction
  )

  if (
    activatedSubscription.status === SubscriptionStatus.CreditTrial
  ) {
    throw Error(
      `Subscription ${activatedSubscription.id} is a credit trial subscription. Credit trial subscriptions cannot be activated (Should never hit this)`
    )
  }

  if (!activatedSubscription.renews) {
    return {
      subscription: activatedSubscription,
      billingPeriod: null,
      billingPeriodItems: null,
      billingRun: null,
    }
  }

  const { billingPeriod, billingPeriodItems } =
    await createBillingPeriodAndItems(
      {
        subscription: activatedSubscription,
        subscriptionItems,
        trialPeriod: !!subscription.trialEnd,
        isInitialBillingPeriod: true,
      },
      transaction
    )
  const scheduledFor = subscription.runBillingAtPeriodStart
    ? startDate
    : endDate

  const shouldCreateBillingRun =
    defaultPaymentMethod &&
    subscription.runBillingAtPeriodStart &&
    params.autoStart &&
    scheduledFor
  /**
   * create a billing run, set to to execute
   */
  const billingRun = shouldCreateBillingRun
    ? await createBillingRun(
        {
          billingPeriod,
          paymentMethod: defaultPaymentMethod,
          scheduledFor,
        },
        transaction
      )
    : null
  return {
    subscription: activatedSubscription,
    billingPeriod,
    billingPeriodItems,
    billingRun,
  }
}

export const initiateSubscriptionTrialPeriod = async (
  params: {
    subscription: Subscription.Record
    subscriptionItems: SubscriptionItem.Record[]
    defaultPaymentMethod: PaymentMethod.Record | null
    autoStart: boolean
  },
  ctx: TransactionEffectsContext
) => {
  const { transaction } = ctx
  const { subscription, subscriptionItems, defaultPaymentMethod } =
    params
  const scheduledFor = subscription.runBillingAtPeriodStart
    ? subscription.currentBillingPeriodStart
    : subscription.currentBillingPeriodEnd

  if (subscription.status !== SubscriptionStatus.Trialing) {
    throw new Error(
      'initiateSubscriptionTrialPeriod: Subscription is not in trialing status, cannot initiate trial period'
    )
  }

  const { billingPeriod, billingPeriodItems } =
    await createBillingPeriodAndItems(
      {
        subscription,
        subscriptionItems,
        trialPeriod: !!subscription.trialEnd,
        isInitialBillingPeriod: true,
      },
      transaction
    )
  const shouldCreateBillingRun =
    defaultPaymentMethod &&
    subscription.runBillingAtPeriodStart &&
    params.autoStart &&
    scheduledFor

  /**
   * create a billing run, set to to execute
   */
  const billingRun = shouldCreateBillingRun
    ? await createBillingRun(
        {
          billingPeriod,
          paymentMethod: defaultPaymentMethod,
          scheduledFor,
        },
        transaction
      )
    : null
  return {
    subscription,
    billingPeriod,
    billingPeriodItems,
    billingRun,
  }
}

export const maybeCreateInitialBillingPeriodAndRun = async (
  params: {
    subscription: Subscription.Record
    subscriptionItems: SubscriptionItem.Record[]
    defaultPaymentMethod: PaymentMethod.Record | null
    autoStart: boolean
    prorateFirstPeriod?: boolean
    preservedBillingPeriodEnd?: Date | number
    preservedBillingPeriodStart?: Date | number
    isDefaultPlan: boolean
  },
  ctx: TransactionEffectsContext
) => {
  const { transaction } = ctx
  const {
    subscription,
    defaultPaymentMethod,
    subscriptionItems,
    isDefaultPlan,
  } = params
  const doNotCharge = subscription.doNotCharge
  /**
   * If the subscription is in credit trial(deprecated), incomplete, or non-renewing status,
   * and no default payment method is provided,
   * we do not create a billing period or run.
   *
   * This is because the subscription is not yet active,
   * and we do not want to create a billing period or run
   * for a subscription that is not yet active.
   */
  const isCreditTrial =
    subscription.status === SubscriptionStatus.CreditTrial
  const isIncomplete =
    subscription.status === SubscriptionStatus.Incomplete
  const isNoDefaultPaymentMethod = !defaultPaymentMethod
  const isNonRenewing = !subscription.renews
  if (
    isCreditTrial ||
    (isIncomplete && isNoDefaultPaymentMethod) ||
    isNonRenewing
  ) {
    return {
      subscription,
      billingPeriod: null,
      billingPeriodItems: null,
      billingRun: null,
    }
  }
  /**
   * If the subscription is in trialing status and has a trial end date,
   * we initiate the trial period.
   */
  if (
    subscription.trialEnd &&
    subscription.status === SubscriptionStatus.Trialing
  ) {
    return await initiateSubscriptionTrialPeriod(params, ctx)
  }
  /**
   * Initial active subscription: create the first billing period based on subscription.currentBillingPeriodStart/end
   * Also create billing period when preserving cycle with proration, even if dates don't match
   *
   * We can create a billing period if we have a payment method OR if doNotCharge is true.
   * When doNotCharge is true, we create the billing period but skip the billing run (see below).
   */
  const shouldCreateBillingPeriod =
    (subscription.startDate ===
      subscription.currentBillingPeriodStart ||
      params.prorateFirstPeriod) &&
    params.autoStart &&
    (defaultPaymentMethod || doNotCharge) &&
    subscription.runBillingAtPeriodStart

  if (shouldCreateBillingPeriod) {
    const { billingPeriod, billingPeriodItems } =
      await createBillingPeriodAndItems(
        {
          subscription,
          subscriptionItems,
          trialPeriod: false,
          isInitialBillingPeriod: true,
        },
        transaction
      )

    // Handle proration if needed
    let finalBillingPeriodItems = billingPeriodItems
    if (params.prorateFirstPeriod && subscription.startDate) {
      const proratedItems = createProratedBillingPeriodItems(
        subscriptionItems,
        billingPeriod,
        subscription.startDate
      )

      if (proratedItems.length > 0) {
        // Replace standard items with prorated versions
        // Delete the original items and insert prorated ones
        // Note: We're creating new items, not modifying existing ones

        // Delete the original billing period items
        await transaction
          .delete(billingPeriodItemsTable)
          .where(
            eq(
              billingPeriodItemsTable.billingPeriodId,
              billingPeriod.id
            )
          )

        // Insert the prorated items
        finalBillingPeriodItems = await bulkInsertBillingPeriodItems(
          proratedItems,
          transaction
        )
      }
    }

    const scheduledFor = subscription.runBillingAtPeriodStart
      ? subscription.currentBillingPeriodStart!
      : subscription.currentBillingPeriodEnd!
    /**
     * Only create a billing run if we have a payment method AND doNotCharge is false.
     * If doNotCharge is true, we skip the billing run since there's nothing to charge,
     * even if a payment method exists (defensive check in case API validation is bypassed).
     */
    const billingRun =
      defaultPaymentMethod && !doNotCharge
        ? await createBillingRun(
            {
              billingPeriod,
              paymentMethod: defaultPaymentMethod,
              scheduledFor,
            },
            transaction
          )
        : null
    return {
      subscription,
      billingPeriod,
      billingPeriodItems: finalBillingPeriodItems,
      billingRun,
    }
  }
  /**
   * If the subscription is in incomplete status and no default payment method is provided,
   * we throw an error.
   *
   * However, if doNotCharge is true, we don't need a payment method.
   *
   * In practice this should never be reached for incomplete subscriptions
   * since we check !doNotCharge in the error condition above.
   */
  if (!defaultPaymentMethod && !isDefaultPlan && !doNotCharge) {
    throw new Error(
      'Default payment method is required if trial period is not set'
    )
  }
  /**
   * If autoStart is false, do not activate yet. Leave subscription as incomplete.
   */
  if (!params.autoStart) {
    return {
      subscription,
      billingPeriod: null,
      billingPeriodItems: null,
      billingRun: null,
    }
  }
  /**
   * If we have a defaultPaymentMethod and no trial period,
   * we activate the subscription
   */
  return await activateSubscription(
    {
      ...params,
      defaultPaymentMethod: defaultPaymentMethod ?? undefined,
    },
    ctx
  )
}

export const ledgerCommandPayload = (params: {
  subscription: Subscription.Record
  subscriptionItemFeatures: SubscriptionItemFeature.Record[]
  billingPeriod: BillingPeriod.Record | null
  billingPeriodItems: BillingPeriodItem.Record[] | null
  billingRun: BillingRun.Record | null
}): BillingPeriodTransitionPayload => {
  const { subscription, subscriptionItemFeatures, billingPeriod } =
    params
  if (subscription.renews === false) {
    return {
      type: 'non_renewing',
      subscription,
      subscriptionFeatureItems: subscriptionItemFeatures.filter(
        (item) => item.type === FeatureType.UsageCreditGrant
      ),
    }
  }
  if (!billingPeriod) {
    throw new Error(
      `ledgerCommandPayload: billingPeriod is null for a standard, renewing subscription. This should never happen. Subscription: ${subscription.id} ${JSON.stringify(subscription)}`
    )
  }
  return {
    type: 'standard',
    subscription,
    previousBillingPeriod: null,
    newBillingPeriod: billingPeriod,
    subscriptionFeatureItems: subscriptionItemFeatures.filter(
      (item) => item.type === FeatureType.UsageCreditGrant
    ),
  } as const
}
