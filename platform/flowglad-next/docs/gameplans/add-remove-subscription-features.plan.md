# Add and Remove Subscription Features

## Overview

Create two protected procedures that allow adding and removing features to/from customer subscriptions through subscription item features. Toggle features will deduplicate, usage features will sum. Usage features support optional immediate credit granting via the CreditGrantRecognized ledger command.

## Implementation Steps

### 1. Add Input Schemas to Schema File

**File**: `platform/flowglad-next/src/db/schema/subscriptionItemFeatures.ts`

Add two new input schemas near the end of the file (after `expireSubscriptionItemFeatureInputSchema`):

```typescript
export const addFeatureToSubscriptionInputSchema = z.object({
  subscriptionItemId: z.string(),
  featureId: z.string(),
  grantCreditsImmediately: z.boolean().optional().default(false),
})

export type AddFeatureToSubscriptionInput = z.infer<
  typeof addFeatureToSubscriptionInputSchema
>

export const removeFeatureFromSubscriptionInputSchema = z.object({
  subscriptionItemId: z.string(),
  featureId: z.string(),
})

export type RemoveFeatureFromSubscriptionInput = z.infer<
  typeof removeFeatureFromSubscriptionInputSchema
>
```

### 2. Add Helper Functions

**File**: `platform/flowglad-next/src/subscriptions/subscriptionItemFeatureHelpers.ts`

Add new imports at the top:

```typescript
import { selectFeatureById } from '@/db/tableMethods/featureMethods'
import { selectSubscriptionItemById } from '@/db/tableMethods/subscriptionItemMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { UsageCredit } from '@/db/schema/usageCredits'
import { insertUsageCredit } from '@/db/tableMethods/usageCreditMethods'
import { processLedgerCommand } from '@/db/ledgerManager/ledgerManager'
import { 
  UsageCreditStatus, 
  UsageCreditType, 
  UsageCreditSourceReferenceType,
  LedgerTransactionType 
} from '@/types'
import { selectBillingPeriods } from '@/db/tableMethods/billingPeriodMethods'
```

Add two main functions and one helper:

**`addFeatureToSubscriptionItem`**: Main function with validation logic:

- Validates subscription item exists and is not expired
- Validates feature exists and is active
- Validates organization and livemode match
- Validates the feature belongs to the same pricing model/product tree as the subscription item’s current price; if not, throw an error so customers can only receive features from their pricing model
- For toggle features: uses upsert to deduplicate
- For usage features: uses insert to allow summing
- Optionally calls `grantImmediateUsageCredits` for usage features

**`grantImmediateUsageCredits`**: Helper function that:

- Creates a UsageCredit record with `UsageCreditType.Grant`
- Sets `sourceReferenceType` to `ManualAdjustment`
- Finds current billing period for expiration date
- Processes `CreditGrantRecognized` ledger command

**`removeFeatureFromSubscriptionItem`**:

- Validates subscription item exists and is not expired
- Validates feature exists
- Validates organization and livemode match between feature and subscription item
- Finds active subscription item feature grant for the specific (subscriptionItemId, featureId) pair
- Throws error if no active grant found
- Expires it by calling `expireSubscriptionItemFeature`

### 3. Create Mutation Files

**File**: `platform/flowglad-next/src/server/mutations/addFeatureToSubscription.ts`

```typescript
import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { addFeatureToSubscriptionInputSchema } from '@/db/schema/subscriptionItemFeatures'
import { addFeatureToSubscriptionItem } from '@/subscriptions/subscriptionItemFeatureHelpers'
import { selectClientSubscriptionItemFeatureAndFeatureById } from '@/db/tableMethods/subscriptionItemFeatureMethods'

export const addFeatureToSubscription = protectedProcedure
  .input(addFeatureToSubscriptionInputSchema)
  .mutation(async ({ input }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const subscriptionItemFeature = await addFeatureToSubscriptionItem(
          input,
          transaction
        )
        
        const [enrichedFeature] =
          await selectClientSubscriptionItemFeatureAndFeatureById(
            subscriptionItemFeature.id,
            transaction
          )
        
        return enrichedFeature
      }
    )
    return {
      data: { subscriptionItemFeature: result },
    }
  })
```

**File**: `platform/flowglad-next/src/server/mutations/removeFeatureFromSubscription.ts`

Similar structure but calls `removeFeatureFromSubscriptionItem`

### 4. Register Procedures in Router

**File**: `platform/flowglad-next/src/server/index.ts`

Add imports:

```typescript
import { addFeatureToSubscription } from './mutations/addFeatureToSubscription'
import { removeFeatureFromSubscription } from './mutations/removeFeatureFromSubscription'
```

Add to `appRouter`:

```typescript
export const appRouter = router({
  // ... existing mutations
  addFeatureToSubscription,
  removeFeatureFromSubscription,
})

## PR Sequencing (Serial)

### PR 1: Add Subscription Feature — Backend

- Extend `src/db/schema/subscriptionItemFeatures.ts` with the add/remove input schemas and exported types.
- Expand `src/subscriptions/subscriptionItemFeatureHelpers.ts` with:
  - `addFeatureToSubscriptionItem` (validation, toggle dedupe, usage summing).
  - `grantImmediateUsageCredits` helper (usage credit insert + ledger command).
  - Any shared validation helpers these functions require.
- Create `src/server/mutations/addFeatureToSubscription.ts` and wire it into the TRPC router plus OpenAPI metadata.
  - Use `comprehensiveAuthenticatedTransaction` so API-key authenticated clients can call it, returning the enriched feature as `result` and emitting a `CreditGrantRecognized` ledger command when immediate credits are granted.
- Register the mutation inside `src/server/index.ts` (and any client-side trpc type exports if needed).
- Add/extend tests that cover:
  - Validation failures (missing feature/subscription item, org mismatch, expired subscription item).
  - Toggle deduplication vs usage stacking.
  - Immediate credit grants invoking the ledger command with the right payload.
- Land this before touching any remove logic so subsequent PRs can reuse the new helpers.

### PR 2: Add Subscription Feature — Frontend

- Consume the new mutation by adding a TRPC client hook (or extending existing hooks) plus typed request/response helpers.
- Update the subscription detail view (`src/app/finance/subscriptions/[id]/InnerSubscriptionPage.tsx`) and related table files to expose an “Add feature” CTA.
- Build a modal or drawer that:
  - Lists available features (reuse `/features` data or add a query if needed).
  - Provides an `AddSubscriptionFeatureItemFormFields` component that takes the subscription’s active items and renders a required dropdown (defaulting to the only active item when there’s just one) plus any additional inputs (`grantCreditsImmediately`, feature selector).
  - Calls the mutation and refreshes `subscription.subscriptionItems`.
- Ensure loading/error states and optimistic updates keep the table in sync.
- Include component/storybook coverage or Playwright test that exercises the new flow.

### PR 3: Remove Subscription Feature — Backend

- Building on PR 1, add `removeFeatureFromSubscriptionItem` to `subscriptionItemFeatureHelpers.ts` (validation + call to `expireSubscriptionItemFeature`).
- Create `src/server/mutations/removeFeatureFromSubscription.ts`, register it in `src/server/index.ts`, and export its OpenAPI metadata.
- Add tests that verify:
  - Attempting to remove a feature without an active grant throws.
  - Organization/livemode mismatches are rejected.
  - Successful removal expires the correct record and does not affect others.
- Update any shared error enums/messages so frontend can render actionable feedback.

### PR 4: Remove Subscription Feature — Frontend

- Add per-row actions (kebab menu or button) in `subscription-items/data-table.tsx`/`columns.tsx` to trigger removal.
- Implement a confirmation dialog that calls the remove mutation and refreshes the table state.
- Surface backend errors (e.g., “no active grant”) inline so operators know what happened.
- Update tests/stories covering the remove interaction and ensure analytics/instrumentation match the add flow.
- Merge only after PR 3 so the mutation/types exist.
```

## Key Edge Cases Handled

### Add Feature Validation:

- Inactive features rejected
- Non-existent features/subscription items rejected
- Expired subscription items rejected
- Organization and livemode must match
- Toggle features: deduplicate (return existing if active)
- Usage features: allow multiple grants (sum credits)

### Remove Feature:

- Only expires active grants
- Throws error if no active grant found
- Expired features won't grant credits at next billing period

## Credit Granting Behavior

### When `grantCreditsImmediately = false` (default):

- Subscription item feature record inserted
- No immediate credits
- Credits granted at next billing period transition

### When `grantCreditsImmediately = true`:

- Subscription item feature record inserted
- Immediate UsageCredit created via CreditGrantRecognized ledger command
- Also grants again at next billing period if `renewalFrequency === EveryBillingPeriod`

## Testing Requirements

- Test that expired subscription item features don't grant usage credits during billing period transition
- Test toggle feature deduplication
- Test usage feature summing (multiple grants)
- Test all validation edge cases
- Test immediate vs deferred credit granting
