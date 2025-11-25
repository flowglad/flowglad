# Step 8: Final Verification

## Objective

Verify your Flowglad integration is complete and functioning correctly.

## Pre-Flight Checklist

### Environment

- [ ] `FLOWGLAD_SECRET_KEY` is set in your environment
- [ ] Using `sk_test_` key for development/staging
- [ ] Key is NOT committed to version control
- [ ] Key is NOT exposed in client-side code

### Code Structure

- [ ] Flowglad packages installed (`@flowglad/nextjs`, `@flowglad/react`, etc.)
- [ ] Server factory created (`utils/flowglad.ts` or similar)
- [ ] API route created (`/api/flowglad/[...path]/route.ts` or Express equivalent)
- [ ] `FlowgladProvider` wrapping your app in the root layout
- [ ] All components using `useBilling` from Flowglad package

### Clean Up

- [ ] No leftover mock billing code
- [ ] No localStorage-based billing
- [ ] No hard-coded plan/pricing data
- [ ] All old billing imports updated

## Functional Tests

### 1. Authentication Flow

Test that billing loads correctly after authentication:

```tsx
// Add this temporarily to verify
'use client'
import { useBilling } from '@flowglad/nextjs'

export function BillingDebug() {
  const { loaded, loadBilling, errors, customer } = useBilling()
  
  console.log({
    loaded,
    loadBilling,
    errors,
    customer: customer?.id,
  })
  
  return (
    <pre>
      {JSON.stringify({ loaded, loadBilling, hasErrors: !!errors, customerId: customer?.id }, null, 2)}
    </pre>
  )
}
```

**Expected behavior:**
- Unauthenticated: `loadBilling: false`, no API calls
- Authenticated: `loadBilling: true`, billing data loads
- After login: Billing should load automatically (if provider is reactive)

### 2. Customer Creation

Verify customers are created in Flowglad:

1. Log in with a new test user
2. Check the Flowglad dashboard for the new customer
3. Verify customer email and name match your database

### 3. Feature Access

Test feature gating:

```tsx
'use client'
import { useBilling } from '@flowglad/nextjs'

export function FeatureTest() {
  const { loaded, checkFeatureAccess } = useBilling()
  
  if (!loaded || !checkFeatureAccess) return <div>Loading...</div>
  
  return (
    <div>
      <p>Premium: {checkFeatureAccess('premium')?.toString()}</p>
      <p>Basic: {checkFeatureAccess('basic')?.toString()}</p>
    </div>
  )
}
```

**Expected behavior:**
- Free user: No premium access
- Paid user: Has premium access
- Features match what's configured in Flowglad dashboard

### 4. Checkout Flow

Test creating a checkout session:

```tsx
'use client'
import { useBilling } from '@flowglad/nextjs'

export function CheckoutTest() {
  const { createCheckoutSession } = useBilling()
  
  const handleCheckout = async () => {
    try {
      await createCheckoutSession({
        priceSlug: 'your-price-slug', // Use your actual price slug
        successUrl: `${window.location.origin}/success`,
        cancelUrl: window.location.href,
        autoRedirect: true,
      })
    } catch (error) {
      console.error('Checkout error:', error)
    }
  }
  
  return <button onClick={handleCheckout}>Test Checkout</button>
}
```

**Expected behavior:**
- Clicking button redirects to Flowglad checkout
- After payment, user is redirected to success URL
- Subscription appears in Flowglad dashboard
- `reload()` shows updated subscription

### 5. Usage Tracking (If Applicable)

Test usage event creation:

```typescript
// In an API route
const billing = await flowglad(userId).getBilling()
const subscription = billing.currentSubscriptions?.[0]

if (subscription) {
  await flowglad(userId).createUsageEvent({
    amount: 1,
    priceId: 'your-usage-price-id',
    subscriptionId: subscription.id,
    usageMeterId: 'your-usage-meter-id',
    transactionId: `test-${Date.now()}`,
  })
}
```

**Expected behavior:**
- Usage event appears in Flowglad dashboard
- `checkUsageBalance()` returns updated balance after `reload()`

### 6. Subscription Cancellation

Test cancellation flow:

```tsx
const { cancelSubscription, subscriptions } = useBilling()

const activeSubscription = subscriptions?.find(s => s.status === 'active')

await cancelSubscription({
  id: activeSubscription.id,
  cancellation: {
    timing: 'at_end_of_current_billing_period',
  },
})
```

**Expected behavior:**
- Subscription status changes to `pending_cancellation`
- End date is set to end of billing period
- Customer still has access until end date

## Error Handling Tests

### 1. Network Errors

Temporarily disable network and verify:
- Loading states display correctly
- Errors are caught and displayed
- App doesn't crash

### 2. Auth Errors

Test with an invalid or expired auth token:
- API should return 401
- User should be redirected to login
- No sensitive data exposed

### 3. Missing Subscription

Test with a user who has no subscription:
- App handles `null` subscription gracefully
- Upgrade prompts are shown appropriately

## Type Checking

Run TypeScript to verify no type errors:

```bash
# Next.js
bun run build

# Or just type check
npx tsc --noEmit
```

## Linting

Run your linter to catch any issues:

```bash
bun run lint
```

## Build Verification

Verify production build works:

```bash
bun run build
```

Check for:
- No build errors
- No warnings about missing environment variables
- Server components compile correctly

## Console Errors

Check browser console for:
- No React hydration errors
- No unhandled promise rejections
- No 404s to `/api/flowglad/*`

## Network Requests

In browser DevTools, verify:
- Billing requests go to `/api/flowglad/billing`
- Requests include auth cookies
- Responses are 200 OK

## Common Issues

### Billing doesn't load

1. Check `loadBilling` prop is `true` when user is authenticated
2. Verify `FlowgladProvider` wraps the component
3. Check API route is returning data
4. Look for errors in browser console

### Customer not created

1. Verify `getCustomerDetails` returns valid name and email
2. Check `customerExternalId` is being passed correctly
3. Look for errors in server logs

### Feature access always false

1. Verify features are configured in Flowglad dashboard
2. Check feature slugs match exactly (case-sensitive)
3. Verify subscription includes the feature

### Checkout doesn't redirect

1. Check for JavaScript errors in console
2. Verify `autoRedirect: true` is set
3. Check successUrl and cancelUrl are valid URLs

### Usage balance not updating

1. Verify usage events are being created (check dashboard)
2. Call `reload()` after creating usage events
3. Check usageMeterSlug matches exactly

## Final Verification Commands

```bash
# 1. Build the project
bun run build

# 2. Run type checking
bun run typecheck # or npx tsc --noEmit

# 3. Run linting
bun run lint

# 4. Start production server
bun run start

# 5. Test in browser
# - Log in as a test user
# - Verify billing data loads
# - Test feature access
# - Test checkout flow
# - Test subscription management
```

## Success Criteria

Your integration is complete when:

1. ✅ Authenticated users see their billing data
2. ✅ Customers are created in Flowglad on first access
3. ✅ Feature access checks work correctly
4. ✅ Checkout sessions redirect to payment
5. ✅ Subscriptions appear after successful payment
6. ✅ Usage tracking works (if applicable)
7. ✅ Subscription cancellation works
8. ✅ No TypeScript errors
9. ✅ No console errors
10. ✅ Production build succeeds

## Next Steps

Once verification is complete:

1. **Test in staging** with real Stripe test mode payments
2. **Monitor** for errors in your error tracking (Sentry, etc.)
3. **Document** any custom implementations for your team
4. **Switch to live mode** when ready for production

## Support

If you encounter issues:

- Join the [Flowglad Discord](https://discord.gg/XTK7hVyQD9) for help
- Check the [documentation](https://docs.flowglad.com)
- Review [example projects](https://github.com/flowglad/flowglad/tree/main/examples)

