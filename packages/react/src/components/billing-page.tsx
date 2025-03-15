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
    <div
      className={cn(
        'flowglad-flex flowglad-flex-col flowglad-gap-4 flowglad-p-4',
        className
      )}
    >
      <div className="flowglad-flex flowglad-flex-col flowglad-gap-2">
        <h3 className="flowglad-text-2xl flowglad-font-bold">
          Payment Methods
        </h3>
        <PaymentMethods paymentMethods={billing.paymentMethods} />
      </div>
      <div className="flowglad-flex flowglad-flex-col flowglad-gap-2">
        <h3 className="flowglad-text-2xl flowglad-font-bold">
          Invoices
        </h3>
        <Invoices invoices={[]} />
      </div>
    </div>
  )
}
