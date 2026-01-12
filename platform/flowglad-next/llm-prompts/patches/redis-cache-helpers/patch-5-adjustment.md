# [redis-cache-helpers] Patch 5 Adjustment

## Context
This is an adjustment to your in-progress work on Patch 5.
The gameplan has been updated and the following changes affect your patch.

## What Changed in the Gameplan

Three new explicit opinions (20-22) were added regarding function naming conventions for cached functions:

1. **Opinion 20: Public function names never mention caching.** Function names like `selectFooCached` or `selectFooBulkCached` leak implementation details. Use clean names like `selectFoo` or `selectFoos` (plural for bulk). Caching is an internal optimization, not part of the public contract.

2. **Opinion 21: Cached code path is the default.** If an internal function has a caching layer, the public function should use that cached path by default. Callers who need fresh data must explicitly opt out.

3. **Opinion 22: Use `ignoreCache` option to bypass cache.** All public functions that internally use caching should accept an optional `{ ignoreCache?: boolean }` parameter. When `ignoreCache: true`, the function bypasses the cache entirely and fetches directly from the database.

## How This Affects Your Work

### Modified Instructions

The gameplan shows a function named `selectSubscriptionItemFeaturesBySubscriptionItemIdsBulkCached`. This naming is **incorrect** per the new opinions.

Instead of:
```typescript
export const selectSubscriptionItemFeaturesBySubscriptionItemIdsBulkCached = async (
  subscriptionItemIds: string[],
  transaction: DbTransaction,
  livemode: boolean
): Promise<SubscriptionItemFeatureWithSlug[]> => {
  // ...
}
```

Use:
```typescript
export const selectSubscriptionItemFeaturesBySubscriptionItemIds = async (
  subscriptionItemIds: string[],
  transaction: DbTransaction,
  livemode: boolean,
  options: { ignoreCache?: boolean } = {}
): Promise<SubscriptionItemFeatureWithSlug[]> => {
  if (subscriptionItemIds.length === 0) {
    return []
  }

  // If ignoreCache is set, bypass the cache entirely
  if (options.ignoreCache) {
    return selectSubscriptionItemFeaturesInternal(
      subscriptionItemIds,
      transaction
    )
  }

  // Cached bulk lookup path...
}
```

The same pattern applies to the single-item function:
```typescript
export const selectSubscriptionItemFeaturesBySubscriptionItemId = async (
  subscriptionItemId: string,
  transaction: DbTransaction,
  livemode: boolean,
  options: { ignoreCache?: boolean } = {}
) => {
  if (options.ignoreCache) {
    return selectSubscriptionItemFeaturesInternal(
      [subscriptionItemId],
      transaction
    )
  }
  // Cached path...
}
```

### Key Principles

1. **Internal function for raw DB queries**: Create a private `selectSubscriptionItemFeaturesInternal` function that does the actual database query without caching.

2. **Public functions hide caching**: The public `selectSubscriptionItemFeaturesBySubscriptionItemId` and `selectSubscriptionItemFeaturesBySubscriptionItemIds` functions use caching by default but accept `{ ignoreCache: true }` to bypass.

3. **Tests should NOT reference "Cached"**: Test function names and assertions should use the clean public API names, not implementation details.

## Action Required

1. Review the changes above
2. Rename any `FooCached` or `FooBulkCached` functions to clean names
3. Add `options: { ignoreCache?: boolean } = {}` parameter to public functions
4. Create private internal functions for raw database queries
5. Update your PR description if the scope changed significantly
6. Ensure tests use the clean public API names

## PR Reference
- PR #1307: [redis-cache-helpers] Patch 5: Cached Subscription Item Features
- Branch: `redis-cache-helpers/patch-5-cached-features`
