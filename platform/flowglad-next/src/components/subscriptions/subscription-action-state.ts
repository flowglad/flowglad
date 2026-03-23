import { PriceType, SubscriptionStatus } from '@db-core/enums'
import type { Subscription } from '@db-core/schema/subscriptions'

interface GetSubscriptionActionStateParams {
  subscription: Pick<
    Subscription.ClientRecord,
    'isFreePlan' | 'scheduledAdjustmentAt' | 'status'
  >
  priceType: PriceType
}

export interface SubscriptionActionState {
  adjustHelperText?: string
  cancelHelperText?: string
  cannotAdjust: boolean
  cannotCancel: boolean
}

/**
 * Returns the shared action availability for subscription table row menus.
 * This mirrors the existing finance subscriptions list gating so customer and
 * finance pages stay aligned.
 */
export const getSubscriptionActionState = ({
  subscription,
  priceType,
}: GetSubscriptionActionStateParams): SubscriptionActionState => {
  const isCanceled =
    subscription.status === SubscriptionStatus.Canceled
  const isFreePlan = subscription.isFreePlan === true
  const isUsageBased = priceType === PriceType.Usage
  const hasPendingCancellation =
    subscription.status === SubscriptionStatus.CancellationScheduled
  const hasPendingAdjustment =
    subscription.scheduledAdjustmentAt !== null

  const cannotCancel = isCanceled || isFreePlan
  const cannotAdjust =
    isCanceled ||
    isFreePlan ||
    isUsageBased ||
    hasPendingCancellation ||
    hasPendingAdjustment

  const cancelHelperText = (() => {
    if (isFreePlan) {
      return 'Default free plans cannot be canceled'
    }
    if (isCanceled) {
      return 'Subscription is already canceled'
    }
    return undefined
  })()

  const adjustHelperText = (() => {
    if (isCanceled) {
      return 'Cannot adjust a canceled subscription'
    }
    if (isFreePlan) {
      return 'Free plans cannot be adjusted'
    }
    if (isUsageBased) {
      return 'Usage-based subscriptions cannot be adjusted'
    }
    if (hasPendingCancellation) {
      return 'Cannot adjust while a cancellation is scheduled'
    }
    if (hasPendingAdjustment) {
      return 'A scheduled adjustment is already pending'
    }
    return undefined
  })()

  return {
    adjustHelperText,
    cancelHelperText,
    cannotAdjust,
    cannotCancel,
  }
}
