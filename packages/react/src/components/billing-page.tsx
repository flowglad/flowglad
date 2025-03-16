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
  catalog: Flowglad.CustomerProfileRetrieveBillingResponse['catalog']
  currentSubscriptions: Flowglad.CustomerProfileRetrieveBillingResponse['currentSubscriptions']
}) => {
  if (currentSubscriptions && currentSubscriptions.length > 0) {
    const currentSubscription = currentSubscriptions[0]
    return (
      <>
        <SectionTitle>Current Subscription</SectionTitle>
        <CurrentSubscriptionCard
          currency={
            currentSubscription.subscriptionItems[0].variant.currency
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
        variants: item.variants.map((variant) => ({
          currency: variant.currency,
          unitPrice: variant.unitPrice,
          intervalCount: variant.intervalCount,
          intervalUnit: variant.intervalUnit,
          priceType: variant.priceType,
          trialPeriodDays: variant.trialPeriodDays,
        })),
      }))}
    />
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
