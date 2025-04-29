'use client'

import CheckoutDetails from '@/components/ion/CheckoutDetails'
import CheckoutPageProvider from '@/contexts/checkoutPageContext'
import { subscriptionCheckoutPageContextValuesWithTrial } from '@/stubs/checkoutContextStubs'

const TestCheckoutDetailsPage = () => {
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
          <CheckoutDetails />
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">
            Subscription without Trial
          </h2>
          <CheckoutDetails />
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Installment</h2>
          <CheckoutDetails />
        </section>
      </div>
    </CheckoutPageProvider>
  )
}

export default TestCheckoutDetailsPage
