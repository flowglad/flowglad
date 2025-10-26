## PaymentIntent Metadata Migration: Invoice → Checkout Session

### Conformance Audit

| Path | Lines | Conforms | What it does | Action |
|---|---:|---|---|---|
| platform/flowglad-next/src/utils/bookkeeping/processPaymentIntentStatusUpdated.ts | 118–160 | Yes | Processes PaymentIntent via metadata.type === checkout_session | Keep |
| platform/flowglad-next/src/utils/bookkeeping/processPaymentIntentStatusUpdated.ts | 112–117 | No (legacy) | Dead-end branch for `'invoiceId' in metadata` | Remove |
| platform/flowglad-next/src/utils/bookkeeping/processSetupIntent.ts | 270–276 | Yes | Rejects SetupIntent if metadata.type !== checkout_session | Keep |
| platform/flowglad-next/src/utils/stripe.ts | 835–887 | Yes | createPaymentIntentForInvoiceCheckoutSession sets metadata.type = checkout_session | Prefer |
| platform/flowglad-next/src/utils/stripe.ts | 889–926 | Yes | createPaymentIntentForCheckoutSession sets metadata.type = checkout_session | Keep |
| platform/flowglad-next/src/utils/stripe.ts | 621–667 | No | createPaymentIntentForInvoice sets metadata.type = invoice | Replace/remove |
| platform/flowglad-next/src/utils/stripe.ts | 531–535 | No | invoiceIntentMetadataSchema still defined | Deprecate or remove |
| platform/flowglad-next/src/utils/stripe.ts | 547–555 | Partial | Union still includes invoice schema | Consider removing from union |
| platform/flowglad-next/src/utils/bookkeeping.ts | 457–466 | No | Calls createPaymentIntentForInvoice | Migrate to checkout-session flow |
| platform/flowglad-next/src/app/purchase/post-payment/route.tsx | 85–105 | Yes | Handles checkout_session metadata (PI→CheckoutSession fallback exists) | Keep |
| platform/flowglad-next/src/utils/checkoutSessionState.ts | 349–387 | Yes | Creates CheckoutSession (Invoice) then PI with checkout_session metadata; attaches PI to session | Keep |
| platform/flowglad-next/src/utils/bookkeeping/processSetupIntent.test.ts | 254–256, 848–850 | No (intentional negative tests) | Crafts invoice-type metadata | Keep if testing rejection; otherwise update |
| platform/flowglad-next/src/utils/bookkeeping/processPaymentIntentStatusUpdated.test.ts | many | Yes | Asserts checkout_session flow | Keep |

Notes:
- UI discriminants like `type: 'invoice'` in `platform/flowglad-next/src/components/ion/TotalBillingDetails.tsx` are not Stripe metadata and don’t need changes.

### Key References (paths and line numbers)

- platform/flowglad-next/src/utils/bookkeeping/processPaymentIntentStatusUpdated.ts
  - 112–117: legacy `'invoiceId' in paymentIntentMetadata` branch (no-op; remove)
  - 118–160: checkout_session branch (active flow)

- platform/flowglad-next/src/utils/stripe.ts
  - 531–535: `invoiceIntentMetadataSchema`
  - 547–555: `stripeIntentMetadataSchema` includes invoice schema
  - 621–667: `createPaymentIntentForInvoice` (sets metadata.type = 'invoice')
  - 835–887: `createPaymentIntentForInvoiceCheckoutSession` (sets metadata.type = 'checkout_session')
  - 889–926: `createPaymentIntentForCheckoutSession` (sets metadata.type = 'checkout_session')

- platform/flowglad-next/src/utils/bookkeeping.ts
  - 457–466: Calls `createPaymentIntentForInvoice` (non-conforming)

- platform/flowglad-next/seedDatabase.ts
  - 1146–1160 and 1231–1255: `setupCheckoutSession` supports optional `invoiceId` for `CheckoutSessionType.Invoice` ✔

- platform/flowglad-next/src/app/purchase/post-payment/route.tsx
  - 85–105: Prefers metadata.type === checkout_session; otherwise locates CheckoutSession by PaymentIntent id

### Migration Guide (how to conform)

1) Replace legacy PaymentIntent creation for invoices
- Where: platform/flowglad-next/src/utils/bookkeeping.ts:457–466
- Replace `createPaymentIntentForInvoice` with:
  - Find or create invoice CheckoutSession
  - `createPaymentIntentForInvoiceCheckoutSession`
  - Attach PI id to the CheckoutSession

2) Remove legacy invoice metadata processing
- Where: platform/flowglad-next/src/utils/bookkeeping/processPaymentIntentStatusUpdated.ts:112–117
- Delete the `'invoiceId' in metadata` branch (it’s a no-op and leads to runtime errors later)

3) Deprecate or remove invoice metadata schema and creator
- Where: platform/flowglad-next/src/utils/stripe.ts
  - Mark `createPaymentIntentForInvoice` as deprecated and remove call sites; optionally delete function
  - Remove `invoiceIntentMetadataSchema` from the union or keep only for temporary back-compat with a runtime warning

4) Update tests that still craft invoice metadata
- Where: platform/flowglad-next/src/utils/bookkeeping/processSetupIntent.test.ts:254–256, 848–850
- If asserting rejection for invoice metadata, keep; if not, switch to checkout_session metadata

5) Verify no remaining creators emit `type: 'invoice'`
- Current offenders: `createPaymentIntentForInvoice` (stripe.ts) and its call at `utils/bookkeeping.ts:457`

6) Keep non-Stripe UI discriminants as-is
- `type: 'invoice'` in UI billing components is fine; not Stripe metadata

### Double-check vs PR Description

- Summary: “Simplified metadata by removing direct invoice type”
  - Status: Not fully true. `IntentMetadataType.Invoice` and its schema still exist and are used by `createPaymentIntentForInvoice`; also one call site remains in `utils/bookkeeping.ts:457–466`.

- “Updated invoice handling to always go through checkout sessions”
  - Status: Mostly true in processing and new creators; however, the legacy creator still sets invoice metadata and should be migrated to the checkout-session creator.

- “Updated payment intent metadata to only support two types: checkout_session and billing_run”
  - Status: Not true yet. Code still defines and validates `invoice` in the discriminated union.

- “Converted all invoice-related tests to use checkout sessions with invoice type”
  - Status: Largely true for positive paths; some tests still craft invoice-type metadata for negative assertions (acceptable). No remaining positive-path reliance on invoice metadata found.

- “setupCheckoutSession in seedDatabase.ts accepts an optional invoiceId parameter”
  - Status: True (1146–1160, 1231–1255).

- “All tests passing with new architecture”
  - Status: Not verified here; the codebase suggests the runtime path for invoice metadata is intentionally unsupported (dead-end), which aligns with the intended regression but conflicts with “removed invoice type.”

### What to change to fully match the PR statements

- Remove the `createPaymentIntentForInvoice` function and its call at `utils/bookkeeping.ts:457–466`; switch to `createPaymentIntentForInvoiceCheckoutSession`.
- Remove `invoiceIntentMetadataSchema` from `stripeIntentMetadataSchema` (or keep temporarily with warnings).
- Remove the legacy `'invoiceId' in metadata` branch in `processPaymentIntentStatusUpdated.ts:112–117`.
- Ensure tests only use invoice-type metadata when asserting rejection; otherwise update to checkout_session.

### Quick Snippets (for review)

```112:160:platform/flowglad-next/src/utils/bookkeeping/processPaymentIntentStatusUpdated.ts
  } else if ('invoiceId' in paymentIntentMetadata) {
    // FIXME: the whole "invoiceId" block should be removed
    // we now support paying invoices through purchase sessions,
    // which seems to be more adaptive,
    // and allows us to use the CheckoutPageContext and PaymentForm
  } else if (
    paymentIntentMetadata.type === IntentMetadataType.CheckoutSession
  ) {
    const {
      checkoutSession,
      purchase: updatedPurchase,
      invoice,
    } = await processStripeChargeForCheckoutSession(
      {
        checkoutSessionId: paymentIntentMetadata.checkoutSessionId,
        charge,
      },
      transaction
    )
    // ...
```

```531:555:platform/flowglad-next/src/utils/stripe.ts
export const invoiceIntentMetadataSchema = z.object({
  invoiceId: z.string(),
  type: z.literal(IntentMetadataType.Invoice),
})

export const stripeIntentMetadataSchema = z
  .discriminatedUnion('type', [
    invoiceIntentMetadataSchema,
    checkoutSessionIntentMetadataSchema,
    billingRunIntentMetadataSchema,
  ])
  .or(z.undefined())
  .or(z.null())