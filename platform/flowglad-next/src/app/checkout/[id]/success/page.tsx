import { CheckoutSessionType } from '@db-core/enums'
import { Result } from 'better-result'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import { selectCheckoutSessionById } from '@/db/tableMethods/checkoutSessionMethods'
import AddPaymentCheckoutSuccessPage from './AddPaymentCheckoutSuccessPage'
import ProductCheckoutSuccessPage from './ProductCheckoutSuccessPage'
import PurchaseCheckoutSuccessPage from './PurchaseCheckoutSuccessPage'

async function CheckoutSuccessPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // Cases based on CheckoutSession.type
  // 1. Purchase
  // 2. AddPaymentMethod
  // 3. Product
  const { id } = await params
  const checkoutSession = (
    await adminTransactionWithResult(async ({ transaction }) => {
      const checkoutSession = (
        await selectCheckoutSessionById(id, transaction)
      ).unwrap()
      return Result.ok(checkoutSession)
    })
  ).unwrap()
  switch (checkoutSession.type) {
    case CheckoutSessionType.Purchase:
      return (
        <PurchaseCheckoutSuccessPage
          checkoutSession={checkoutSession}
        />
      )
    case CheckoutSessionType.AddPaymentMethod:
      return (
        <AddPaymentCheckoutSuccessPage
          checkoutSession={checkoutSession}
        />
      )
    case CheckoutSessionType.Product:
      return <ProductCheckoutSuccessPage product={checkoutSession} />
  }
  return (
    <div>
      <h1>Hello World</h1>
    </div>
  )
}

export default CheckoutSuccessPage
