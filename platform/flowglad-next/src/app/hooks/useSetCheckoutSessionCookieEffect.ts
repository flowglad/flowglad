import { useEffect, useRef } from 'react'
import { trpc } from '../_trpc/client'
import { CheckoutFlowType, CheckoutSessionType } from '@/types'
import { BillingInfoCore } from '@/db/tableMethods/purchaseMethods'

export const useSetCheckoutSessionCookieEffect = (
  billingInfo: BillingInfoCore
) => {
  const { checkoutSession } = billingInfo
  const checkoutSessionId = checkoutSession.id
  const setCheckoutSessionCookie =
    trpc.purchases.createSession.useMutation()
  const componentIsMounted = useRef(true)

  useEffect(() => {
    return () => {
      componentIsMounted.current = false
    }
  }, [])

  const mountedRef = useRef(false)

  useEffect(() => {
    if (mountedRef.current) {
      return
    }
    mountedRef.current = true
    const checkoutSessionType = checkoutSession.type
    if (checkoutSessionType === CheckoutSessionType.Invoice) {
      setCheckoutSessionCookie.mutateAsync({
        invoiceId: checkoutSession.invoiceId,
        id: checkoutSessionId,
        type: CheckoutSessionType.Invoice,
      })
    }
    if (checkoutSessionType === CheckoutSessionType.Purchase) {
      setCheckoutSessionCookie.mutateAsync({
        purchaseId: checkoutSession.purchaseId,
        type: CheckoutSessionType.Purchase,
        id: checkoutSessionId,
      })
    }
    if (checkoutSessionType === CheckoutSessionType.Product) {
      if (billingInfo.flowType === CheckoutFlowType.Invoice) {
        throw Error(
          `Flow type cannot be Invoice while purchase session type is Product. Purchase session id: ${checkoutSessionId}`
        )
      }

      setCheckoutSessionCookie.mutateAsync({
        productId: billingInfo.product!.id,
        type: CheckoutSessionType.Product,
        id: checkoutSessionId,
      })
    }
  })
}
