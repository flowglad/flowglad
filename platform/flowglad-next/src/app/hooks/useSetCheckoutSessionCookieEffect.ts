import { useEffect, useRef } from 'react'
import type { CheckoutInfoCore } from '@/db/tableMethods/purchaseMethods'
import { CheckoutFlowType, CheckoutSessionType } from '@/types'
import { trpc } from '../_trpc/client'

export const useSetCheckoutSessionCookieEffect = (
  checkoutInfo: CheckoutInfoCore
) => {
  const { checkoutSession } = checkoutInfo
  const checkoutSessionId = checkoutSession.id
  const setCheckoutSessionCookie =
    trpc.checkoutSessions.public.setSession.useMutation()
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
    if (checkoutSessionType === CheckoutSessionType.Purchase) {
      setCheckoutSessionCookie.mutateAsync({
        purchaseId: checkoutSession.purchaseId,
        type: CheckoutSessionType.Purchase,
        id: checkoutSessionId,
      })
    }
    if (checkoutSessionType === CheckoutSessionType.Product) {
      if (checkoutInfo.flowType === CheckoutFlowType.Invoice) {
        throw Error(
          `Flow type cannot be Invoice while purchase session type is Product. Checkout session id: ${checkoutSessionId}`
        )
      }
      if (
        checkoutInfo.flowType === CheckoutFlowType.AddPaymentMethod
      ) {
        throw Error(
          `Flow type cannot be AddPaymentMethod while purchase session type is Product. Checkout session id: ${checkoutSessionId}`
        )
      }

      setCheckoutSessionCookie.mutateAsync({
        productId: checkoutInfo.product!.id,
        type: CheckoutSessionType.Product,
        id: checkoutSessionId,
      })
    }
  })
}
