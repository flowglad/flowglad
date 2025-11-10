# Checkout Billing State Issue

## Problem

After purchasing a plan via checkout, users cannot see usage meter progress bars or interact with buttons, regardless of their plan. Refreshing the page fixes the issue, as does logging out and back in.

## Root Cause

The `usageMeterBalances` array is empty after checkout, even though the subscription has `usage_credit_grant` feature items. The `checkUsageBalance` function looks for `experimental?.usageMeterBalances` in the subscription object, but this array is not populated immediately after checkout.

## Technical Details

### How `checkUsageBalance` Works

The `checkUsageBalance` function (from `packages/shared/src/utils.ts`) looks for `experimental?.usageMeterBalances` in the subscription object:

```typescript
const usageMeterBalancesBySlug =
  experimental?.usageMeterBalances.reduce(
    (acc, usageMeterBalance) => {
      acc[usageMeterBalance.slug] = usageMeterBalance
      return acc
    },
    {} as Record<string, UsageMeterBalance>
  ) ?? {}
const usageMeterBalance = usageMeterBalancesBySlug[usageMeterSlug]
if (!usageMeterBalance) {
  return null
}
```

If `usageMeterBalances` is empty, `checkUsageBalance` returns `null`, which causes the UI to not show usage meters or allow interaction.

### How Usage Meter Balances Are Computed

Usage meter balances are computed by aggregating ledger entries during the billing run. The ledger entries are created from:
- Usage credit grants (from feature items, converted to ledger entries during billing period transitions)
- Usage events (consumption, which create ledger entries)
- Other ledger transactions

The billing run executes asynchronously via webhook (`stripePaymentIntentSucceededTask`) for payment intents, which means there's a delay between subscription creation and balance computation.
