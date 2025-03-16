import {
  selectPurchaseById,
  selectPurchases,
} from '@/db/tableMethods/purchaseMethods'
import { notFound } from 'next/navigation'
import { adminTransaction } from '@/db/databaseMethods'
import InnerPaymentConfirmedPage from './InnerPaymentConfirmedPage'

interface PageProps {
  params: Promise<{
    id: string
  }>
}

const PaymentConfirmedPage = async ({ params }: PageProps) => {
  const { id } = await params
  const purchase = await adminTransaction(async ({ transaction }) => {
    return selectPurchaseById(id, transaction)
  })

  if (!purchase) {
    notFound()
  }

  return <InnerPaymentConfirmedPage />
}

export default PaymentConfirmedPage
