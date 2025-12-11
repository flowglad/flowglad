---
title: 'Integrate by HTTP'
description: 'Integrating Flowglad without using the SDKs'
---

Flowglad offers rich full stack SDKs for Typescript. If your backend is written in another language besides Typescript, you can integrate Flowglad via our public APIs. All you need is a way to make HTTP requests. Even without the backend SDKs, Flowglad provides a simple integration path.

Implementing Flowglad on your backend will consist of 3 steps:

1. Add Flowglad customer creation to your product's account creation flow
  - Call [POST /customers](https://docs.flowglad.com/api-reference/customer/create-customer) to create the customer

2. Create a server route at `/api/flowglad/:subroute` that is publicly accessible and authenticated using your existing server-side authentication logic. Your frontend will send requests to this route via the [@flowglad/react](https://www.npmjs.com/package/@flowglad/react) SDK.

3. Implement a set of helper functions in your backend to handle common actions:
   - `findOrCreateCustomerBilling({ name: string, externalId: string, email: string })`:
     call [GET /customers/:externalId/billing](https://docs.flowglad.com/api-reference/customer/get-customer). If you receive a 404, call [POST /customers](https://docs.flowglad.com/api-reference/customer/create-customer) to create the customer
   - `checkFeatureAccess(slug: string, customerBilling: <GET /customers/:externalId response>)`:
        - gets `experimental.featureItems` payload in the first `currentSubscription` in the customer billing response
        - returns true if a feature is present where `feature.type=="toggle" && feature.slug == slug`
        - returns false otherwise
   - if you plan to track usage in real time: `checkUsageBalance(slug: string, customerBilling: <GET /customers/:externalId response>)`:
        - gets `experimental.usageMeterBalances` in the first `currentSubscription` in the customer billing response
        - finds the `usageMeterBalance` where `usageMeterBalance.slug == slug`
        - returns `{ availableBalance: number }` if the usageMeterBalance is found, using `usageMeterBalance.availableBalance`
        - returns `null` if not found

### Authenticate and Derive the Requesting Customer

Every server-originated Flowglad call needs the customer scoped using your ids. The `FlowgladServer` class ([`packages/server/src/FlowgladServer.ts`](https://github.com/flowglad/flowglad/blob/main/packages/server/src/FlowgladServer.ts)) shows the contract we enforce in the SDKs:

- derive a `{ externalId, name, email }` triple either from your auth provider (NextAuth, Supabase, Clerk) or a custom `getRequestingCustomer`.
- only one auth provider can populate a request. If you support multiple providers, branch before instantiating your handler.
- validate the input: `externalId` must be a non-empty string and `email` must be present, otherwise the request should fail fast with a helpful error because the React SDK expects authenticated users.

When you are not using our SDKs, replicate the same logic in your middleware:

1. Run your normal authentication, error out with `401` if no session.
2. Map the session object to Flowglad's customer shape.
3. Pass that shape into every helper that talks to Flowglad's API.

Once you have the customer, you can reuse the helper functions above to translate frontend requests into Flowglad API calls.

#### Implement the Sub-routes
Expose a single authenticated route such as `/api/flowglad/:subroute`. Each subroute matches a `FlowgladActionKey` (see [`packages/shared/src/types.ts`](https://github.com/flowglad/flowglad/blob/main/packages/shared/src/types.ts)) and **must** accept a `POST`, even for reads—the React SDK always sends `POST` requests and expects `{ data, error? }` in the response body.

**POST /customers/billing**
- use your authentication logic to derive the customer making the request from your frontend `{ name: string, externalId: string, email: string }`, where the `email` is the email address associated with the owner of the account and `externalId` is the id of the customer in your system
- use the `findOrCreateCustomerBilling` helper to get the customer billing data, return it inside `{ data: billing }`, and optionally include the computed helpers (`checkFeatureAccess`, `checkUsageBalance`, `getProduct`, `getPrice`) before sending the JSON back to the client.

**POST /checkout-sessions/create**
- accept `{ successUrl, cancelUrl, outputMetadata?, outputName?, quantity?, priceId? | priceSlug? }`.
- if the frontend sent a `priceSlug`, look it up from the catalog you received in `/customers/billing` and substitute the resolved `priceId` before calling [POST /checkout-sessions](https://docs.flowglad.com/api-reference/checkout-sessions/create-checkout-session).
- always include `customerExternalId` (your id) in the request body so Flowglad scopes the checkout correctly.

**POST /checkout-sessions/create-add-payment-method**
- payload mirrors the create endpoint but without price fields, plus an optional `targetSubscriptionId`.
- send `type: "add_payment_method"` to [POST /checkout-sessions](https://docs.flowglad.com/api-reference/checkout-sessions/create-checkout-session).
- respond with the `{ checkoutSession: { id, url } }` object from Flowglad. The React SDK will optionally redirect using the `url`.

**POST /checkout-sessions/create-activate-subscription**
- requires `{ targetSubscriptionId, priceId, successUrl, cancelUrl }`.
- send `type: "activate_subscription"` to [POST /checkout-sessions](https://docs.flowglad.com/api-reference/checkout-sessions/create-checkout-session) so the Flowglad dashboard knows to attach the subscription after payment.

**POST /subscriptions/cancel**
- expect `{ id, cancellation }` where `cancellation` is one of:
  - `{ timing: "at_end_of_current_billing_period" }`
  - `{ timing: "immediately" }`
- fetch the subscription first and confirm that `subscription.customerId` matches the requesting customer's Flowglad id before calling [POST /subscriptions/:id/cancel](https://docs.flowglad.com/api-reference/subscriptions/cancel-subscription). If they do not match, return `403`.
