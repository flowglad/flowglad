export enum FlowgladActionKey {
  GetCustomerBilling = 'customers/billing',
  FindOrCreateCustomer = 'customers/find-or-create',
  CreateCheckoutSession = 'checkout-sessions/create',
  CancelSubscription = 'subscriptions/cancel',
}

export enum HTTPMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
}
