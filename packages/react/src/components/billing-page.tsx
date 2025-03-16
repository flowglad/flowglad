'use client'

import { Flowglad } from '@flowglad/node'
import { Invoices } from './invoices'
import { cn } from '../lib/utils'
import { PaymentMethods } from './payment-methods'
import { CustomerBillingDetails } from './customer-billing-details'

const SectionTitle = ({
  children,
}: {
  children: React.ReactNode
}) => {
  return (
    <h3 className="flowglad-text-xl flowglad-font-semibold">
      {children}
    </h3>
  )
}

const Section = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flowglad-flex flowglad-flex-col flowglad-gap-2 flowglad-pb-4">
      {children}
    </div>
  )
}

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
      <Section>
        <SectionTitle>Payment Methods</SectionTitle>
        <PaymentMethods paymentMethods={billing.paymentMethods} />
      </Section>
      <Section>
        <SectionTitle>Billing Details</SectionTitle>
        <CustomerBillingDetails
          name={billing.customerProfile.name ?? ''}
          email={billing.customerProfile.email}
          billingAddress={
            !billing.customerProfile.billingAddress
              ? undefined
              : {
                  line1:
                    billing.customerProfile.billingAddress.address
                      .line1,
                  line2:
                    billing.customerProfile.billingAddress.address
                      .line2 ?? undefined,
                  city: billing.customerProfile.billingAddress.address
                    .city,
                  state:
                    billing.customerProfile.billingAddress.address
                      .state,
                  postalCode:
                    billing.customerProfile.billingAddress.address
                      .postal_code,
                  country:
                    billing.customerProfile.billingAddress.address
                      .country,
                }
          }
        />
      </Section>
      <Section>
        <SectionTitle>Invoices</SectionTitle>
        <Invoices invoices={[]} />
      </Section>
    </div>
  )
}
