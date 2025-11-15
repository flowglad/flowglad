## Free Trials

To give a customer a free trial to a certain plan or product, you have two options:

If you require a payment method to start the trial:

Use `createCheckoutSession`, available both on `useBilling` and `flowgladServer`, to create a checkout with the details:
```ts
const checkout = createCheckoutSession({ // or flowgladServer.createCheckoutSession()
    priceSlug: 'product_with_trial'
})
```

If you don't want to require a payment method to start trial:
Use `createSubscription`, available only on `flowgladServer` to create a subscription with the foo:
```ts
const subscription = flowgladServer.createSubscription({
    
})
```