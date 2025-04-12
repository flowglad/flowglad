import { adminTransaction } from '@/db/adminTransaction'
import { selectCheckoutSessionById } from '@/db/tableMethods/checkoutSessionMethods'
import { CheckoutSessionType } from '@/types'
import PurchaseCheckoutSuccessPage from './PurchaseCheckoutSuccessPage'
import InvoiceCheckoutSuccessPage from './InvoiceCheckoutSuccessPage'
import AddPaymentCheckoutSuccessPage from './AddPaymentCheckoutSuccessPage'
import ProductCheckoutSuccessPage from './ProductCheckoutSuccessPage'

async function CheckoutSuccessPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // Cases based on CheckoutSession.type
  // 1. Purchase
  // 2. Invoice
  // 3. AddPaymentMethod
  // 4. Product
  const { id } = await params
  const checkoutSession = await adminTransaction(
    async ({ transaction }) => {
      const checkoutSession = await selectCheckoutSessionById(
        id,
        transaction
      )
      return checkoutSession
    }
  )
  switch (checkoutSession.type) {
    case CheckoutSessionType.Purchase:
      return (
        <PurchaseCheckoutSuccessPage
          checkoutSession={checkoutSession}
        />
      )
    case CheckoutSessionType.Invoice:
      return <InvoiceCheckoutSuccessPage invoice={checkoutSession} />
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
