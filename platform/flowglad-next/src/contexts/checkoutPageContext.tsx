'use client'
import debounce from 'debounce'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { createContext, useContext } from 'react'
import {
  CheckoutFlowType,
  CurrencyCode,
  Nullish,
  PriceType,
} from '@/types'
import {
  BillingInfoCore,
  billingInfoSchema,
} from '@/db/tableMethods/purchaseMethods'
import { Variant } from '@/db/schema/variants'
import core from '@/utils/core'
import { trpc } from '@/app/_trpc/client'
import { useRouter } from 'next/navigation'
import { CheckoutSession } from '@/db/schema/checkoutSessions'

export type SubscriptionCheckoutDetails = Pick<
  Variant.SubscriptionRecord,
  'trialPeriodDays' | 'intervalUnit' | 'intervalCount' | 'currency'
> & {
  pricePerBillingCycle: number
}

export type SubscriptionOnlyCheckoutDetails =
  | {
      flowType: CheckoutFlowType.Subscription
      subscriptionDetails: SubscriptionCheckoutDetails
    }
  | {
      flowType: Exclude<
        CheckoutFlowType,
        CheckoutFlowType.Subscription
      >
      subscriptionDetails?: never
    }

/**
 * This type is a bit complex. Here's a breakdown:
 * - BillingInfoCore is the core billing info that is always present
 * - SubscriptionOnlyCheckoutDetails ensures we only have subscription details present for
 *  subscription purchases
 * - MaybeSerializedProposal is a type that is either a serialized proposal or not, only present
 * if there's a purchase with a proposal property
 */
export type CheckoutPageContextValues = {
  sellerOrganization?: Pick<Organization.Record, 'logoURL' | 'name'>
  product?: Nullish<Product.ClientRecord>
  flowType: CheckoutFlowType
  editCheckoutSessionLoading?: boolean
  editCheckoutSession: ReturnType<
    typeof trpc.purchases.updateSession.useMutation
  >['mutateAsync']
  attemptDiscountCode: ReturnType<
    typeof trpc.discounts.attempt.useMutation
  >['mutateAsync']
  clearDiscountCode: ReturnType<
    typeof trpc.discounts.clear.useMutation
  >['mutateAsync']
  discountCode?: string
  checkoutBlocked?: boolean
  currency: CurrencyCode
  checkoutSession?: CheckoutSession.ClientRecord
} & SubscriptionOnlyCheckoutDetails &
  BillingInfoCore

const CheckoutPageContext = createContext<
  Partial<CheckoutPageContextValues>
>({
  flowType: CheckoutFlowType.SinglePayment,
})

const subscriptionDetailsFromBillingInfoCore = (
  billingInfo: BillingInfoCore
): SubscriptionCheckoutDetails | undefined => {
  if (billingInfo.flowType !== CheckoutFlowType.Subscription) {
    return undefined
  }
  const { purchase, variant } = billingInfo
  /**
   * For each subscription detail field:
   * Default to variant values if purchase values are not present,
   * but if purchase values are present (including literally 0),
   * use purchase values.
   */
  const subscriptionDetails: SubscriptionCheckoutDetails | undefined =
    billingInfo.flowType === CheckoutFlowType.Subscription
      ? {
          currency: variant.currency,
          trialPeriodDays: core.isNil(purchase?.trialPeriodDays)
            ? variant.trialPeriodDays!
            : purchase.trialPeriodDays,
          intervalUnit: core.isNil(purchase?.intervalUnit)
            ? variant.intervalUnit!
            : purchase.intervalUnit,
          intervalCount: core.isNil(purchase?.intervalCount)
            ? variant.intervalCount!
            : purchase.intervalCount,
          pricePerBillingCycle: core.isNil(
            purchase?.pricePerBillingCycle
          )
            ? variant.unitPrice!
            : purchase.pricePerBillingCycle,
        }
      : undefined
  return subscriptionDetails
}

export const useCheckoutPageContext =
  (): CheckoutPageContextValues => {
    const checkoutInfo = useContext(CheckoutPageContext)
    const billingInfo = billingInfoSchema.parse(checkoutInfo)
    const editCheckoutSession =
      trpc.purchases.updateSession.useMutation()
    const attemptDiscountCode = trpc.discounts.attempt.useMutation()
    const clearDiscountCode = trpc.discounts.clear.useMutation()
    const router = useRouter()
    const checkoutBlocked = editCheckoutSession.isPending ?? false
    const currency: CurrencyCode =
      billingInfo.flowType === CheckoutFlowType.Invoice
        ? billingInfo.invoice.currency
        : billingInfo.variant.currency
    return {
      ...billingInfo,
      subscriptionDetails:
        subscriptionDetailsFromBillingInfoCore(billingInfo),
      attemptDiscountCode: async (input) => {
        const result = await attemptDiscountCode.mutateAsync(input)
        router.refresh()
        return result
      },
      checkoutBlocked,
      currency,
      editCheckoutSession: debounce(async (input) => {
        const result = await editCheckoutSession.mutateAsync(input)
        router.refresh()
        return result
      }, 500),
      clearDiscountCode: async (input) => {
        const result = await clearDiscountCode.mutateAsync(input)
        router.refresh()
        return result
      },
    } as CheckoutPageContextValues
  }

const CheckoutPageProvider = ({
  children,
  values,
}: {
  children: React.ReactNode
  values: BillingInfoCore
}) => {
  return (
    <CheckoutPageContext.Provider value={values}>
      {children}
    </CheckoutPageContext.Provider>
  )
}

export default CheckoutPageProvider
