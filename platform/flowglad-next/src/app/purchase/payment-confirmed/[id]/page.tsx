import { Result } from 'better-result'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { adminTransaction } from '@/db/adminTransaction'

export const metadata: Metadata = {
  title: 'Payment Confirmed',
  description: 'Your payment has been confirmed',
}

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
