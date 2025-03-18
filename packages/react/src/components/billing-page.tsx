'use client'

import { Flowglad } from '@flowglad/node'
import { Invoices } from './invoices'
import { cn } from '../lib/utils'
import { PaymentMethods } from './payment-methods'
import { CustomerBillingDetails } from './customer-billing-details'
import { CurrentSubscriptionCard } from './current-subscription-card'
import { PricingTable } from './pricing-table'

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

const CurrentSubscriptionOrPricingTable = ({
  catalog,
  currentSubscriptions,
}: {
  catalog: Flowglad.CustomerRetrieveBillingResponse['catalog']
  currentSubscriptions: Flowglad.CustomerRetrieveBillingResponse['currentSubscriptions']
}) => {
  if (currentSubscriptions && currentSubscriptions.length > 0) {
    const currentSubscription = currentSubscriptions[0]
    return (
      <>
        <SectionTitle>Current Subscription</SectionTitle>
        <CurrentSubscriptionCard
          currency={
            currentSubscription.subscriptionItems[0].price.currency
          }
          subscription={currentSubscription}
          subscriptionItems={currentSubscription.subscriptionItems}
          product={{
            name: 'Pro Plus',
            pluralQuantityLabel: null,
          }}
        />
      </>
    )
  }
  return (
    <PricingTable
      products={catalog.products.map((item) => ({
        name: item.product.name,
        description: item.product.description,
        displayFeatures: item.product.displayFeatures,
        primaryButtonText: 'Subscribe',
        secondaryButtonText: 'Learn More',
        prices: item.prices.map((price) => ({
          currency: price.currency,
          unitPrice: price.unitPrice,
          intervalCount: price.intervalCount,
          intervalUnit: price.intervalUnit,
          type: price.type,
          trialPeriodDays: price.trialPeriodDays,
        })),
      }))}
    />
  )
}

export function BillingPage({
  billing,
  className,
}: {
  billing: Flowglad.CustomerRetrieveBillingResponse
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
        <CurrentSubscriptionOrPricingTable
          catalog={billing.catalog}
          currentSubscriptions={billing.currentSubscriptions}
        />
      </Section>
      <Section>
        <SectionTitle>Payment Methods</SectionTitle>
        <PaymentMethods paymentMethods={billing.paymentMethods} />
      </Section>
      <Section>
        <SectionTitle>Billing Details</SectionTitle>
        <CustomerBillingDetails
          name={billing.customer.name ?? ''}
          email={billing.customer.email}
          billingAddress={
            !billing.customer.billingAddress
              ? undefined
              : {
                  line1:
                    billing.customer.billingAddress.address.line1,
                  line2:
                    billing.customer.billingAddress.address.line2 ??
                    undefined,
                  city: billing.customer.billingAddress.address.city,
                  state:
                    billing.customer.billingAddress.address.state,
                  postalCode:
                    billing.customer.billingAddress.address
                      .postal_code,
                  country:
                    billing.customer.billingAddress.address.country,
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
