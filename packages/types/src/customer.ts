import { Flowglad } from '@flowglad/node'

export type Customer = Flowglad.CustomerRetrieveResponse['customer']

export type CustomerBillingDetails =
  Flowglad.Customers.CustomerRetrieveBillingResponse & {
    /**
     * Force-add the billing portal URL to the billing response
     * for now, until we update the Node SDK to include the billing portal URL
     */
    billingPortalUrl: string
  }
