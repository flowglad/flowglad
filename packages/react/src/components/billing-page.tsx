'use client'

import { Flowglad } from '@flowglad/node'
import { Invoices } from './invoices'
import { cn } from '../lib/utils'
import { PaymentMethods } from './payment-methods'

export function BillingPage({
  billing,
  className,
}: {
  billing: Flowglad.CustomerProfileRetrieveBillingResponse
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-4 p-4', className)}>
      <h3 className="text-2xl font-bold">Payment Methods</h3>
      <PaymentMethods paymentMethods={billing.paymentMethods} />
      <h3 className="text-2xl font-bold">Invoices</h3>
      <Invoices invoices={[]} />
    </div>
  )
}
