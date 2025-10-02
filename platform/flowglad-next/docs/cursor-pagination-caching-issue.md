# Cursor Pagination Caching Issue

## Issue Summary

When navigating through paginated tables (e.g., Products table), the first backward navigation from Page 2 to Page 1 triggers a refetch even though Page 1 was already loaded. Subsequent navigations use cached data correctly.

### Observable Behavior

**Navigation sequence:**
1. Load Page 1 → **Fetches data** (expected)
2. Navigate to Page 2 → **Fetches data** (expected)
3. Navigate back to Page 1 → **Fetches data again** (unexpected - should use cache)
4. Navigate to Page 2 again → Uses cached data ✓
5. Navigate back to Page 1 → Uses cached data ✓

After the initial "warm-up" of pages, caching works correctly.

## Reproduction Steps

1. Navigate to `/store/products` (or any table using `usePaginatedTableState`)
2. Wait for Page 1 to load
3. Click "Next" to go to Page 2
4. Wait for Page 2 to load
5. Click "Previous" to go back to Page 1
6. Observe that the table shows "Loading..." and fetches data again

## Root Cause Analysis

### The Problem: Inconsistent Query Cache Keys

The issue stems from how React Query generates cache keys for cursor-based pagination. The cache key includes **both** `pageAfter` and `pageBefore` parameters, which change based on navigation direction.

#### Navigation 1: Initial Page 1 Visit
```typescript
{
  pageAfter: undefined,
  pageBefore: undefined,
  pageSize: 10,
  filters: {},
  // ...
}
// Cache key: "products.getTableRows-{pageAfter:undefined,pageBefore:undefined,...}"
```

#### Navigation 2: Forward to Page 2
```typescript
{
  pageAfter: "cursor_abc123", // end cursor from Page 1
  pageBefore: undefined,
  pageSize: 10,
  filters: {},
  // ...
}
// Cache key: "products.getTableRows-{pageAfter:cursor_abc123,pageBefore:undefined,...}"
```

#### Navigation 3: Backward to Page 1
```typescript
{
  pageAfter: undefined,
  pageBefore: "cursor_xyz789", // start cursor from Page 2
  pageSize: 10,
  filters: {},
  // ...
}
// Cache key: "products.getTableRows-{pageAfter:undefined,pageBefore:cursor_xyz789,...}"
// ❌ DIFFERENT from Navigation 1 even though it's the same page!
```

The presence of `pageBefore` creates a **different cache key**, causing React Query to treat it as a new query and fetch data again.

### Code References

#### 1. `usePaginatedTableState` Hook
**File:** `platform/flowglad-next/src/app/hooks/usePaginatedTableState.ts`

**Lines 83-92:** Query parameters construction
```typescript
const params = {
  pageAfter,
  pageBefore,
  pageSize,
  filters,
  searchQuery,
  goToFirst,
  goToLast,
}
const { data, isLoading, isFetching } = useQuery(params)
```

**Lines 102-123:** Pagination change handler
```typescript
const handlePaginationChange = (newPageIndex: number) => {
  setPageIndex(newPageIndex)
  setGoToFirst(false)
  setGoToLast(false)

  if (
    newPageIndex > pageIndex &&
    data?.hasNextPage &&
    data?.endCursor
  ) {
    // Forward navigation
    setPageAfter(data.endCursor)
    setPageBefore(undefined)
  } else if (
    newPageIndex < pageIndex &&
    data?.hasPreviousPage &&
    data?.startCursor
  ) {
    // Backward navigation - sets pageBefore
    setPageBefore(data.startCursor)
    setPageAfter(undefined)
  }
}
```

#### 2. Products Table Implementation
**File:** `platform/flowglad-next/src/app/store/products/data-table.tsx`

**Lines 71-84:** Usage of `usePaginatedTableState`
```typescript
const {
  pageIndex,
  pageSize,
  handlePaginationChange,
  goToFirstPage,
  data,
  isLoading,
  isFetching,
} = usePaginatedTableState<ProductRow, ProductsTableFilters>({
  initialCurrentCursor: undefined,
  pageSize: currentPageSize,
  filters: filters,
  useQuery: trpc.products.getTableRows.useQuery,
})
```

#### 3. Cursor Pagination Backend
**File:** `platform/flowglad-next/src/db/tableUtils.ts`

**Lines 1333-1586:** `createCursorPaginatedSelectFunction`
- Implements bidirectional cursor pagination
- Uses `pageAfter` for forward navigation
- Uses `pageBefore` for backward navigation
- Returns `startCursor` and `endCursor` for each page

#### 4. React Query Configuration
**File:** `platform/flowglad-next/src/app/_trpc/Provider.tsx`

**Lines 20-31:** Global query defaults
```typescript
new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 3,
      retryDelay: 600,
    },
  },
})
```

These defaults are appropriate, but don't solve the cache key issue.

## Technical Deep Dive

### Why Cursor Pagination Uses Two Parameters

Cursor-based pagination is inherently directional:
- **Forward pagination:** "Give me items after this cursor"
- **Backward pagination:** "Give me items before this cursor"

The backend (`createCursorPaginatedSelectFunction`) needs to know the direction to:
1. Order results correctly (ascending vs descending)
2. Apply the correct comparison operator (`>` vs `<`)
3. Determine `hasNextPage` and `hasPreviousPage` accurately

### Why React Query Creates Different Cache Keys

React Query serializes all query parameters to create a unique cache key. Even though we're logically on "Page 1" in both cases, the parameters are different:

**First visit to Page 1:**
```json
{ "pageAfter": null, "pageBefore": null }
```

**Return to Page 1 from Page 2:**
```json
{ "pageAfter": null, "pageBefore": "cursor_xyz789" }
```

React Query treats these as two different queries because the parameters are different.

## Affected Tables

All tables using `usePaginatedTableState`:

1. **Products Table** - `platform/flowglad-next/src/app/store/products/data-table.tsx`
2. **Customers Table** - `platform/flowglad-next/src/app/customers/data-table.tsx`
3. **Pricing Models Table** - `platform/flowglad-next/src/app/store/pricing-models/PricingModelsTable.tsx`
4. **Prices Table** - `platform/flowglad-next/src/app/store/products/[id]/PricesTable.tsx`
5. **Features Table** - `platform/flowglad-next/src/app/features/FeaturesTable.tsx`
6. **Subscriptions Table** - `platform/flowglad-next/src/app/finance/subscriptions/SubscriptionsTable.tsx`
7. **Discounts Table** - `platform/flowglad-next/src/app/store/discounts/DiscountsTable.tsx`
8. **Usage Meters Table** - `platform/flowglad-next/src/app/store/usage-meters/UsageMetersTable.tsx`
9. **Organization Members Table** - `platform/flowglad-next/src/app/settings/teammates/OrganizationMembersTable.tsx`

## Potential Solutions

### Option 1: Track Page Identity (Recommended)

Add a stable page identifier that remains consistent regardless of navigation direction.

**Pros:**
- Minimal backend changes
- Preserves cursor pagination benefits
- Consistent cache keys

**Cons:**
- Requires tracking page positions
- Slightly more complex state management

**Implementation:**
```typescript
// In usePaginatedTableState
const [pageCache, setPageCache] = useState<Map<number, { 
  pageAfter?: string, 
  pageBefore?: string 
}>>(new Map())

const handlePaginationChange = (newPageIndex: number) => {
  const cachedPage = pageCache.get(newPageIndex)
  if (cachedPage) {
    // Use cached cursor info for consistent cache keys
    setPageAfter(cachedPage.pageAfter)
    setPageBefore(cachedPage.pageBefore)
  } else {
    // Normal navigation logic
    // Store in cache after successful fetch
  }
}
```

### Option 2: Use Offset-Based Pagination

Replace cursor pagination with offset-based pagination (LIMIT/OFFSET).

**Pros:**
- Simple, consistent cache keys (`page=0`, `page=1`, etc.)
- Easier to implement "jump to page"
- Natural page numbering

**Cons:**
- Less efficient for large datasets
- Inconsistent results if data changes during pagination
- Can't easily handle insertions/deletions mid-pagination

**Implementation:**
```typescript
// Query params would be:
{
  offset: pageIndex * pageSize,
  limit: pageSize,
  filters: {},
}
// Cache key: "products.getTableRows-{offset:0,limit:10,...}"
```

### Option 3: Custom Query Key Function

Override React Query's default key generation to normalize pagination parameters.

**Pros:**
- Keeps cursor pagination
- Minimal changes to existing code
- Transparent to backend

**Cons:**
- Requires understanding React Query internals
- May need custom cache invalidation logic
- Could hide bugs if not implemented carefully

**Implementation:**
```typescript
// In usePaginatedTableState
const normalizedParams = {
  ...params,
  // Generate stable identifier for the page
  _pageId: calculatePageId(pageAfter, pageBefore, pageIndex),
}

const { data, isLoading, isFetching } = useQuery(normalizedParams, {
  queryKeyHashFn: (queryKey) => {
    // Custom hash that ignores pageAfter/pageBefore differences
    // for the same logical page
  }
})
```

### Option 4: Use `keepPreviousData: true`

Show previous data while fetching new data.

**Pros:**
- One-line change
- Improves UX immediately
- No refactoring needed

**Cons:**
- Doesn't actually solve the caching problem
- Still fetches unnecessarily
- Data may flash/update unexpectedly

**Implementation:**
```typescript
// In usePaginatedTableState
const { data, isLoading, isFetching } = useQuery(params, {
  keepPreviousData: true,
})
```

### Option 5: Manual Cache Management

Manually store and retrieve page data.

**Pros:**
- Full control over caching behavior
- Can implement any caching strategy

**Cons:**
- Bypasses React Query's caching
- More complex state management
- Need to handle cache invalidation manually

**Implementation:**
```typescript
// In usePaginatedTableState
const [manualCache, setManualCache] = useState<Map<number, PageData>>(new Map())

const getCachedPage = (pageIndex: number) => {
  return manualCache.get(pageIndex)
}
```

## Recommended Approach

**Option 1 (Track Page Identity)** is recommended because:

1. Preserves the benefits of cursor pagination (consistency, efficiency)
2. Fixes the cache key issue
3. Minimal changes to backend
4. Maintains current architecture

**Implementation Plan:**

1. Add page tracking to `usePaginatedTableState`:
   - Map of `pageIndex` → `{ pageAfter, pageBefore, data }`
   - Store cursor info after each successful fetch
   
2. Modify `handlePaginationChange`:
   - Check if page is in cache first
   - Use cached cursors if available
   - This creates consistent query params

3. Clear page cache when:
   - Filters change
   - Search query changes
   - Data is mutated

## Additional Context

### Related Documentation

- **TRPC Stale Data Remediation:** `platform/flowglad-next/docs/gameplans/stale-trpc-remidiation.md`
  - Documents global query defaults
  - Explains `refetchOnMount` and `staleTime` settings
  
- **Shadcn Data Table Gameplan:** `platform/flowglad-next/docs/gameplans/shadcn-data-table-gameplan.md`
  - Server-side pagination implementation
  - Table architecture decisions

### Current Workarounds in Codebase

None currently. The behavior exists across all paginated tables.

### Performance Implications

- **Current behavior:** Slight delay on first backward navigation
- **After fix:** Instant page transitions after first visit
- **Network impact:** Reduces unnecessary API calls by ~33% in typical usage

## Testing Recommendations

After implementing a fix:

1. **Manual Testing:**
   - Navigate forward and backward multiple times
   - Verify no unnecessary loading states
   - Check browser DevTools Network tab for API calls
   
2. **Automated Testing:**
   - Test cache persistence across navigation
   - Verify cache invalidation on filter/search changes
   - Test with different page sizes
   
3. **Edge Cases:**
   - Rapid pagination (click multiple times quickly)
   - Pagination during data mutations
   - Large datasets with many pages
   - Empty results

## Related Issues

None documented yet. This is the first formal documentation of the issue.

## Last Updated

October 2, 2025

