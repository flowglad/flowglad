## Free Trials

To give a customer a free trial to a certain plan or product, you have two options:

If you require a payment method to start the trial:

Use `createCheckoutSession`, available both on `useBilling` and `flowgladServer`, to create a checkout with the details:
```ts
const checkout = createCheckoutSession({ // or flowgladServer.createCheckoutSession()
    priceSlug: 'product_with_trial',
    autoRedirect: true,
    redirectUrl: window.location.href,
    cancelUrl: window.location.href
}) // creates a checkoutSession
```

If you don't want to require a payment method to start trial:
Use `createSubscription`, available only on `flowgladServer` to create a subscription that starts the trial immediately:
```ts
const subscription = flowgladServer.createSubscription({
    priceSlug: 'product_with_trial'
})
```

### Activating Free Trials

To activate a subscription on a free trial, create an `activate_subscription` checkoutSession:
```ts
const { currentSubscriptions, createActivateSubscriptionCheckoutSesssion } = useBilling()

const checkout = createActivateSubscriptionCheckoutSession({ // or flowgladServer.createActivateSubscriptionCheckoutSession()
    autoRedirect: true,
    subscriptionId: currentSubscriptions![0].id,
    redirectUrl: window.location.href,
    cancelUrl: window.location.href
}) // creates a checkoutSession
```