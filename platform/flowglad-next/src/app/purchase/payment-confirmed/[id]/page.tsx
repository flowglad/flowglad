import { notFound } from 'next/navigation'
import { adminTransactionWithResult } from '@/db/adminTransaction'
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
    await adminTransactionWithResult(async ({ transaction }) => {
      return selectPurchaseById(id, transaction)
    })
  ).unwrap()

  if (!purchase) {
    notFound()
  }

  return <InnerPaymentConfirmedPage />
}

export default PaymentConfirmedPage
