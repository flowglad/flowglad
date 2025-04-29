'use client'

import CheckoutInfo from '@/components/ion/CheckoutInfo'
import CheckoutPageProvider from '@/contexts/checkoutPageContext'
import { subscriptionCheckoutPageContextValuesWithTrial } from '@/stubs/checkoutContextStubs'

const TestCheckoutInfoPage = () => {
  return (
    <CheckoutPageProvider
      values={subscriptionCheckoutPageContextValuesWithTrial}
    >
      <div className="flex flex-col gap-8 p-8">
        <h1 className="text-2xl font-bold">Billing Info Test Page</h1>

        <section>
          <h2 className="text-xl font-semibold mb-4">
            Subscription with Trial
          </h2>
          <CheckoutInfo />
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">
            Subscription without Trial
          </h2>
          <CheckoutInfo />
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Installment</h2>
          <CheckoutInfo />
        </section>
      </div>
    </CheckoutPageProvider>
  )
}

export default TestCheckoutInfoPage
