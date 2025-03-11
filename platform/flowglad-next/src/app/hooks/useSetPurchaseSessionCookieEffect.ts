import { useEffect, useRef } from 'react'
import { trpc } from '../_trpc/client'
import { CheckoutFlowType, PurchaseSessionType } from '@/types'
import { BillingInfoCore } from '@/db/tableMethods/purchaseMethods'

export const useSetPurchaseSessionCookieEffect = (
  billingInfo: BillingInfoCore
) => {
  const { purchaseSession } = billingInfo
  const purchaseSessionId = purchaseSession.id
  const setPurchaseSessionCookie =
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
    const purchaseSessionType = purchaseSession.type
    if (purchaseSessionType === PurchaseSessionType.Invoice) {
      setPurchaseSessionCookie.mutateAsync({
        invoiceId: purchaseSession.InvoiceId,
        id: purchaseSessionId,
        type: PurchaseSessionType.Invoice,
      })
    }
    if (purchaseSessionType === PurchaseSessionType.Purchase) {
      setPurchaseSessionCookie.mutateAsync({
        purchaseId: purchaseSession.PurchaseId,
        type: PurchaseSessionType.Purchase,
        id: purchaseSessionId,
      })
    }
    if (purchaseSessionType === PurchaseSessionType.Product) {
      if (billingInfo.flowType === CheckoutFlowType.Invoice) {
        throw Error(
          `Flow type cannot be Invoice while purchase session type is Product. Purchase session id: ${purchaseSessionId}`
        )
      }

      setPurchaseSessionCookie.mutateAsync({
        productId: billingInfo.product!.id,
        type: PurchaseSessionType.Product,
        id: purchaseSessionId,
      })
    }
  })
}
