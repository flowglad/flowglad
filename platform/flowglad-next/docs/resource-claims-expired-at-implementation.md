# Resource Claims `expired_at` Column Implementation

## Summary

This document summarizes the work completed and remaining tasks for implementing temporary/expiring resource claims during downgrade interim periods.

## Problem Statement

When a user schedules a downgrade to take effect at the end of the billing period, there's an interim period where they still have access to their current capacity. During this interim:

1. User buys 3 seats for the month
2. Claims 2 of those seats
3. Schedules downgrade to 2 seats at end of month
4. Tries to claim the 3rd seat during the interim period

**Question**: Should we allow that 3rd claim?

**Decision**: Yes, but mark it as temporary with `expired_at` set to the billing period end date. The claim is valid until the downgrade takes effect.

## Completed Work

### 1. Schema Changes
- Added `expired_at` column to `resource_claims` table in `src/db/schema/resourceClaims.ts`
- Column is nullable timestamptz
- Active claims query becomes: `releasedAt IS NULL AND (expiredAt IS NULL OR expiredAt > NOW())`

### 2. Migration (0277_productive_mojo.sql)
```sql
ALTER TABLE "resource_claims" DROP CONSTRAINT "resource_claims_subscription_item_feature_id_subscription_item_features_id_fk";
DROP INDEX IF EXISTS "resource_claims_subscription_item_feature_id_idx";
ALTER TABLE "resource_claims" ADD COLUMN "expired_at" timestamptz;
ALTER TABLE "resource_claims" DROP COLUMN IF EXISTS "subscription_item_feature_id";
```

This migration:
- Drops FK constraint on `subscription_item_feature_id`
- Drops the index on `subscription_item_feature_id`
- Adds the new `expired_at` column
- Drops the `subscription_item_feature_id` column (decoupling from subscription item features)

### 3. Raw SQL Updates
- Updated `resourceClaimHelpers.ts` to include `expired_at` in:
  - The Zod raw row schema (`expired_at: z.number().nullable()`)
  - The transform function (`expiredAt: row.expired_at`)
  - The RETURNING clause of the raw SQL insert query

### 4. Naming Convention
- Changed from `expires_at` to `expired_at` to match codebase conventions

## Remaining Tasks

### Task 1: Release Claims on Downgrade Execution

When a scheduled downgrade actually takes effect (at billing period transition), claims that exceed the new capacity should be released.

**Location**: Likely in `billingPeriodHelpers.ts` or similar billing transition logic

**Logic**:
```typescript
// When downgrade executes at billing period end:
// 1. Get new capacity after downgrade
// 2. Count active claims
// 3. If active claims > new capacity:
//    - Release excess claims (FIFO - oldest first, or by expired_at first)
//    - Set releaseReason to 'capacity_reduced' or similar
```

**Alternative**: Claims with `expired_at` set will naturally become inactive when `NOW() > expired_at`. The active claims query already handles this. However, you may want to explicitly release them for cleaner data.

### Task 2: Set `expired_at` When Claiming Over Future Capacity

When a user claims resources during an interim period (after scheduling a downgrade but before it takes effect), and the claim would exceed the future capacity:

**Location**: `claimResourceTransaction` in `src/resources/resourceClaimHelpers.ts`

**Logic**:
```typescript
// In claimResourceTransaction:
// 1. Check if subscription has a scheduled downgrade (cancelScheduledAt or pending adjustment)
// 2. Get the future capacity after the scheduled change
// 3. If current claims + new claim > future capacity:
//    a. Allow the claim
//    b. Set expired_at = scheduled change date (billing period end)
//    c. Return info indicating the claim is temporary
// 4. If current claims + new claim <= future capacity:
//    a. Allow the claim normally (expired_at = null)
```

**Key considerations**:
- Need to look up the scheduled downgrade/adjustment for the subscription
- Need to determine what the future capacity will be
- Need to get the billing period end date for the `expired_at` value

### Task 3: Update Return Types

The `ClaimResourceResult` interface should indicate when claims are temporary:

```typescript
export interface ClaimResourceResult {
  claims: ResourceClaim.Record[]
  usage: {
    resourceSlug: string
    resourceId: string
    capacity: number
    claimed: number
    available: number
  }
  // New field to indicate temporary claims
  temporaryClaims?: {
    claimIds: string[]
    expiresAt: number // timestamp when these claims expire
    reason: string // e.g., "Claim valid until scheduled downgrade takes effect"
  }
}
```

### Task 4: Tests to Implement

1. **Test: Claim during interim period sets expired_at**
   - Setup: Create subscription, schedule downgrade, claim over future capacity
   - Assert: Claim succeeds with `expired_at` set to billing period end

2. **Test: Claim within future capacity doesn't set expired_at**
   - Setup: Create subscription, schedule downgrade, claim within future capacity
   - Assert: Claim succeeds with `expired_at = null`

3. **Test: Expired claims not counted as active**
   - Setup: Create claim with `expired_at` in the past
   - Assert: `selectActiveResourceClaims` doesn't return it
   - Assert: `countActiveResourceClaims` doesn't count it

4. **Test: Claims released on downgrade execution**
   - Setup: Create subscription with claims, schedule downgrade, execute billing period transition
   - Assert: Excess claims are released with appropriate reason

5. **Test: Get resource usage excludes expired claims**
   - Setup: Mix of active, released, and expired claims
   - Assert: `getResourceUsage` only counts non-expired active claims

## Files to Modify

1. `src/resources/resourceClaimHelpers.ts` - Add expired_at logic to claim transaction
2. `src/db/tableMethods/resourceClaimMethods.ts` - Update queries to filter expired claims
3. `src/subscriptions/billingPeriodHelpers.ts` - Handle claim release on downgrade
4. `src/resources/resourceClaimHelpers.test.ts` - Add tests for new logic
5. `src/subscriptions/adjustSubscription.test.ts` - Add tests for interim period claims

## Branch

`joeysabs/resource-claim-decoupling`

## Related Context

- This is part of Patch 1 of a larger gameplan to decouple resource claims from subscription item features
- The `subscription_item_feature_id` column has been removed as part of this work
- Claims are now identified by `(subscriptionId, resourceId)` instead of `subscriptionItemFeatureId`
