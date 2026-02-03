import { Result } from 'better-result'
import { notFound } from 'next/navigation'
import { adminTransaction } from '@/db/adminTransaction'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import InnerPaymentConfirmedPage from './InnerPaymentConfirmedPage'

interface PageProps {
  params: Promise<{
    id: string
  }>
}

const PaymentConfirmedPage = async ({ params }: PageProps) => {
  const { id } = await params
  const purchase = (
    await adminTransaction(async ({ transaction }) => {
      const purchaseRecord = (
        await selectPurchaseById(id, transaction)
      ).unwrap()
      return Result.ok(purchaseRecord)
    })
  ).unwrap()

  if (!purchase) {
    notFound()
  }

  return <InnerPaymentConfirmedPage />
}

export default PaymentConfirmedPage
