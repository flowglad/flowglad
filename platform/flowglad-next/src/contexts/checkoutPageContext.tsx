'use client'
import debounce from 'debounce'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { createContext, useContext } from 'react'
import { CheckoutFlowType, CurrencyCode, Nullish } from '@/types'
import {
  CheckoutInfoCore,
  checkoutInfoSchema,
} from '@/db/tableMethods/purchaseMethods'
import { Price } from '@/db/schema/prices'
import core from '@/utils/core'
import { trpc } from '@/app/_trpc/client'
import { useRouter } from 'next/navigation'
import { CheckoutSession } from '@/db/schema/checkoutSessions'

export type SubscriptionCheckoutDetails = Pick<
  Price.SubscriptionRecord | Price.UsageRecord,
  | 'trialPeriodDays'
  | 'intervalUnit'
  | 'intervalCount'
  | 'currency'
  | 'type'
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
 * - CheckoutInfoCore is the core billing info that is always present
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
  editCheckoutSessionPaymentMethodType: ReturnType<
    typeof trpc.checkoutSessions.public.setPaymentMethodType.useMutation
  >['mutateAsync']
  editCheckoutSessionCustomerEmail: ReturnType<
    typeof trpc.checkoutSessions.public.setCustomerEmail.useMutation
  >['mutateAsync']
  editCheckoutSessionBillingAddress: ReturnType<
    typeof trpc.checkoutSessions.public.setBillingAddress.useMutation
  >['mutateAsync']
  attemptDiscountCode: ReturnType<
    typeof trpc.discounts.attempt.useMutation
  >['mutateAsync']
  clearDiscountCode: ReturnType<
    typeof trpc.discounts.clear.useMutation
  >['mutateAsync']
  editCheckoutSessionAutomaticallyUpdateSubscriptions: ReturnType<
    typeof trpc.checkoutSessions.public.setAutomaticallyUpdateSubscriptions.useMutation
  >['mutateAsync']
  discountCode?: string
  checkoutBlocked?: boolean
  currency: CurrencyCode
  checkoutSession?: CheckoutSession.ClientRecord
} & SubscriptionOnlyCheckoutDetails &
  CheckoutInfoCore

const CheckoutPageContext = createContext<
  Partial<CheckoutPageContextValues>
>({
  flowType: CheckoutFlowType.SinglePayment,
})

const subscriptionDetailsFromCheckoutInfoCore = (
  checkoutInfo: CheckoutInfoCore
): SubscriptionCheckoutDetails | undefined => {
  if (checkoutInfo.flowType !== CheckoutFlowType.Subscription) {
    return undefined
  }
  const { purchase, price } = checkoutInfo
  /**
   * For each subscription detail field:
   * Default to price values if purchase values are not present,
   * but if purchase values are present (including literally 0),
   * use purchase values.
   */
  const subscriptionDetails: SubscriptionCheckoutDetails | undefined =
    checkoutInfo.flowType === CheckoutFlowType.Subscription
      ? {
          currency: price.currency,
          trialPeriodDays: core.isNil(purchase?.trialPeriodDays)
            ? price.trialPeriodDays!
            : purchase.trialPeriodDays,
          intervalUnit: core.isNil(purchase?.intervalUnit)
            ? price.intervalUnit!
            : purchase.intervalUnit,
          intervalCount: core.isNil(purchase?.intervalCount)
            ? price.intervalCount!
            : purchase.intervalCount,
          pricePerBillingCycle: core.isNil(
            purchase?.pricePerBillingCycle
          )
            ? price.unitPrice!
            : purchase.pricePerBillingCycle,
          type: price.type,
        }
      : undefined
  return subscriptionDetails
}

const currencyFromCheckoutInfoCore = (
  checkoutInfo: CheckoutInfoCore
): CurrencyCode => {
  if (checkoutInfo.flowType === CheckoutFlowType.Invoice) {
    return checkoutInfo.invoice.currency
  }
  if (checkoutInfo.flowType === CheckoutFlowType.AddPaymentMethod) {
    return checkoutInfo.sellerOrganization.defaultCurrency
  }
  return checkoutInfo.price.currency
}

export const useCheckoutPageContext =
  (): CheckoutPageContextValues => {
    const rawCheckoutInfo = useContext(CheckoutPageContext)
    const checkoutInfo = checkoutInfoSchema.parse(rawCheckoutInfo)
    const editCheckoutSession =
      trpc.purchases.updateSession.useMutation()
    const editCheckoutSessionPaymentMethodType =
      trpc.checkoutSessions.public.setPaymentMethodType.useMutation()
    const editCheckoutSessionCustomerEmail =
      trpc.checkoutSessions.public.setCustomerEmail.useMutation()
    const editCheckoutSessionBillingAddress =
      trpc.checkoutSessions.public.setBillingAddress.useMutation()
    const editCheckoutSessionAutomaticallyUpdateSubscriptions =
      trpc.checkoutSessions.public.setAutomaticallyUpdateSubscriptions.useMutation()
    const attemptDiscountCode = trpc.discounts.attempt.useMutation()
    const clearDiscountCode = trpc.discounts.clear.useMutation()
    const router = useRouter()
    const checkoutBlocked = editCheckoutSession.isPending ?? false
    const currency = currencyFromCheckoutInfoCore(checkoutInfo)
    const subscriptionDetails =
      subscriptionDetailsFromCheckoutInfoCore(checkoutInfo)
    return {
      ...checkoutInfo,
      subscriptionDetails,
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
      editCheckoutSessionPaymentMethodType: debounce(
        async (input) => {
          const result =
            await editCheckoutSessionPaymentMethodType.mutateAsync(
              input
            )
          router.refresh()
          return result
        },
        500
      ),
      editCheckoutSessionBillingAddress: debounce(async (input) => {
        const result =
          await editCheckoutSessionBillingAddress.mutateAsync(input)
        router.refresh()
        return result
      }, 500),
      editCheckoutSessionCustomerEmail: debounce(async (input) => {
        const result =
          await editCheckoutSessionCustomerEmail.mutateAsync(input)
        router.refresh()
        return result
      }, 500),
      editCheckoutSessionAutomaticallyUpdateSubscriptions: debounce(
        async (input) => {
          const result =
            await editCheckoutSessionAutomaticallyUpdateSubscriptions.mutateAsync(
              input
            )
          router.refresh()
          return result
        },
        500
      ),
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
  values: CheckoutInfoCore
}) => {
  return (
    <CheckoutPageContext.Provider value={values}>
      {children}
    </CheckoutPageContext.Provider>
  )
}

export default CheckoutPageProvider

export const TestCheckoutPageProvider = ({
  children,
  values,
}: {
  children: React.ReactNode
  values: CheckoutPageContextValues
}) => {
  return (
    <CheckoutPageProvider values={values}>
      {children}
    </CheckoutPageProvider>
  )
}
