import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Billing Portal - Flowglad',
  description:
    'Manage your subscription, payment methods, and invoices',
}

export default function BillingPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
