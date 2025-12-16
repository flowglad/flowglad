# Gameplan: Subscription Table Dynamic Filters

> **Prerequisite:** This gameplan depends on `general-table-dynamic-filters.md` for the reusable `DataTableFilterPopover` component.

## Current State Analysis

### What Exists Today

**1. Product Filter (Single-Select Dropdown)**
Location: `src/app/finance/subscriptions/data-table.tsx` (~lines 70-104)

```ts
const [selectedProduct, setSelectedProduct] = React.useState<string | undefined>(undefined)

const { data: allProductOptions } = 
  trpc.subscriptions.listDistinctSubscriptionProductNames.useQuery({})
```

**2. Status Filter (Button Group)**
Location: `src/app/finance/subscriptions/page.tsx` (~lines 17-25)

Uses `FilterButtonGroup` component with status tabs.

**3. Backend Filter Support**
Location: `src/server/routers/subscriptionsRouter.ts` (~lines 535-544)

```ts
z.object({
  status: z.nativeEnum(SubscriptionStatus).optional(),
  customerId: z.string().optional(),
  organizationId: z.string().optional(),
  productName: z.string().optional(),
})
```

**4. `isFreePlan` Column**
Location: `src/db/schema/subscriptions.ts` (~line 83)

Column exists and is populated. `true` when `price.unitPrice === 0`.

### What's Missing

1. **No "Paid Only" filter** - Backend doesn't accept `isFreePlan` filter
2. **No unified filter UI** - Status and product filters are separate controls
3. **No default filter** - Page shows all subscriptions (should show paid only by default)

### Important: No UI Table Column Changes

Table columns remain unchanged: Customer, Status, Product, Created, Actions

---

## Required Changes

### 1. Backend: Add `isFreePlan` to tRPC Input Schema

**File:** `src/server/routers/subscriptionsRouter.ts` (~line 535-544)

```ts
const getTableRows = protectedProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        status: z.nativeEnum(SubscriptionStatus).optional(),
        customerId: z.string().optional(),
        organizationId: z.string().optional(),
        productName: z.string().optional(),
        isFreePlan: z.boolean().optional(),  // ADD THIS
      })
    )
  )
```

### 2. Backend: Add `isFreePlan` to SubscriptionTableFilters Type

**File:** `src/db/tableMethods/subscriptionMethods.ts` (~line 66-70)

```ts
export type SubscriptionTableFilters = SelectConditions<
  typeof subscriptions
> & {
  productName?: string
  isFreePlan?: boolean  // ADD THIS
}
```

> **Note:** No changes needed to `buildAdditionalFilterClause`. Since `isFreePlan` is a direct column on the `subscriptions` table, the base filtering system (`sanitizeBaseTableFilters` + `whereClauseFromObject`) handles it automatically. Only cross-table filters like `productName` require the additional filter clause handler.

### 3. Frontend: Update SubscriptionsTableFilters Interface

**File:** `src/app/finance/subscriptions/data-table.tsx` (~line 40-45)

```ts
export interface SubscriptionsTableFilters {
  status?: SubscriptionStatus
  customerId?: string
  organizationId?: string
  productName?: string
  isFreePlan?: boolean  // ADD THIS
}
```

### 4. Frontend: Integrate DataTableFilterPopover

**File:** `src/app/finance/subscriptions/data-table.tsx`

Replace separate `FilterButtonGroup` and product `Select` with unified filter popover:

```ts
// Filter state with "Paid only" as default
interface SubscriptionFilterState {
  planType: 'all' | 'paid' | 'free'
  status: SubscriptionStatus | 'all'
  productName: string | undefined
}

const defaultFilterState: SubscriptionFilterState = {
  planType: 'paid',  // DEFAULT: Paid only
  status: 'all',
  productName: undefined,
}

const [filterState, setFilterState] = React.useState<SubscriptionFilterState>(defaultFilterState)

// Derive server filters from UI state
const derivedFilters = React.useMemo((): SubscriptionsTableFilters => {
  const filters: SubscriptionsTableFilters = {}
  
  if (filterState.planType === 'paid') {
    filters.isFreePlan = false
  } else if (filterState.planType === 'free') {
    filters.isFreePlan = true
  }
  
  if (filterState.status !== 'all') {
    filters.status = filterState.status
  }
  
  if (filterState.productName) {
    filters.productName = filterState.productName
  }
  
  return filters
}, [filterState])
```

**Toolbar layout:**

```tsx
<div className="flex items-center gap-2">
  <CollapsibleSearch ... />
  <DataTableFilterPopover
    sections={[
      {
        id: 'planType',
        type: 'single-select',
        label: 'Plan Type',
        options: [
          { value: 'all', label: 'All plans' },
          { value: 'paid', label: 'Paid only' },
          { value: 'free', label: 'Free only' },
        ],
      },
      {
        id: 'status',
        type: 'single-select',
        label: 'Status',
        options: [
          { value: 'all', label: 'All' },
          { value: SubscriptionStatus.Active, label: 'Active' },
          { value: SubscriptionStatus.Trialing, label: 'Trialing' },
          { value: SubscriptionStatus.Canceled, label: 'Canceled' },
          { value: SubscriptionStatus.Paused, label: 'Paused' },
          { value: SubscriptionStatus.PastDue, label: 'Past Due' },
          { value: SubscriptionStatus.Incomplete, label: 'Incomplete' },
        ],
      },
      {
        id: 'productName',
        type: 'async-select',
        label: 'Product',
        loadOptions: async () => {
          // Uses existing listDistinctSubscriptionProductNames query
          return [
            { value: '', label: 'All products' },
            ...productOptions.map(p => ({ value: p, label: p })),
          ]
        },
      },
    ]}
    values={filterState}
    onChange={setFilterState}
    defaultValues={defaultFilterState}
  />
  <DataTableViewOptions table={table} />
</div>
```

### 5. Frontend: Simplify Page Component

**File:** `src/app/finance/subscriptions/page.tsx`

Remove filter state from page. All filter logic is now in `SubscriptionsDataTable`:

```ts
function InternalSubscriptionsPage() {
  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <PageHeader title="Subscriptions" />
        <div>
          <SubscriptionsDataTable />
        </div>
      </div>
    </InternalPageContainer>
  )
}
```

---

## Acceptance Criteria

- [ ] **"Paid only" is the default filter** - Free plan subscriptions hidden by default
- [ ] **Single "Filter" button** in toolbar opens popover with all filter options
- [ ] Filter popover contains: Plan Type, Status, Product sections
- [ ] Plan Type: "All plans", "Paid only" (default), "Free only"
- [ ] Status: All existing status options
- [ ] Product: "All products" + dynamically loaded product names
- [ ] Badge shows count when filters differ from defaults
- [ ] Reset link restores defaults
- [ ] Filters work with server-side pagination (reset to page 1 on change)
- [ ] "X results" count updates correctly
- [ ] No new columns added to table UI

---

## Open Questions

1. **Badge count: Should "Paid only" (the default) count as an active filter?**
   - **Decision:** No. Only show badge when user deviates from defaults.

2. **Filter label: "Plan Type" vs "Pricing"?**
   - **Decision:** "Plan Type" - clearer distinction.

---

## Explicit Opinions

1. **No new table columns** - Only filter controls in toolbar.

2. **"Paid only" as default** - Users primarily care about paid subscriptions.

3. **Filter state in data table component** - Better encapsulation than lifting to page.

4. **Direct column filters handled automatically** - `isFreePlan` is a direct column, so no `buildAdditionalFilterClause` changes needed. The base filtering system handles it.

5. **Server-side filtering only** - Enterprise architecture.

---

## PRs

### PR 1: Backend - Add `isFreePlan` Filter Support

**Files to Modify:**

1. `src/server/routers/subscriptionsRouter.ts` (~line 538)
   - Add `isFreePlan: z.boolean().optional()` to input schema

2. `src/db/tableMethods/subscriptionMethods.ts` (~line 66-70)
   - Add `isFreePlan?: boolean` to `SubscriptionTableFilters` type

**Test Cases:**

```ts
// File: src/db/tableMethods/subscriptionMethods.test.ts

describe('selectSubscriptionsTableRowData', () => {
  describe('isFreePlan filter', () => {
    it('should return only free plan subscriptions when isFreePlan: true', async () => {
      // Setup: Create 2 subscriptions with isFreePlan: true, 2 with isFreePlan: false
      // Action: Query with filters: { isFreePlan: true, organizationId }
      // Expect: 
      //   - result.items.length === 2
      //   - All items have subscription.isFreePlan === true
    })
    
    it('should return only paid subscriptions when isFreePlan: false', async () => {
      // Setup: Create 2 subscriptions with isFreePlan: true, 2 with isFreePlan: false
      // Action: Query with filters: { isFreePlan: false, organizationId }
      // Expect:
      //   - result.items.length === 2
      //   - All items have subscription.isFreePlan === false
    })
    
    it('should return all subscriptions when isFreePlan is undefined', async () => {
      // Setup: Create 4 subscriptions (2 free, 2 paid)
      // Action: Query with filters: { organizationId }
      // Expect: result.items.length === 4
    })
  })
  
  describe('combined filters', () => {
    it('should combine isFreePlan and productName filters', async () => {
      // Setup: Create 4 subscriptions:
      //   - Product A, free
      //   - Product A, paid  
      //   - Product B, free
      //   - Product B, paid
      // Action: Query with filters: { isFreePlan: false, productName: 'Product A' }
      // Expect:
      //   - result.items.length === 1
      //   - Item is Product A, paid
    })
    
    it('should combine isFreePlan and status filters', async () => {
      // Setup: Create active and canceled subscriptions, both free and paid
      // Action: Query with filters: { isFreePlan: false, status: 'active' }
      // Expect: Only active paid subscriptions returned
    })
  })
})
```

**Estimated effort:** ~30 minutes

---

### PR 2: Frontend - Create DataTableFilterPopover Component

> See `general-table-dynamic-filters.md` for full component specification.

**Files to Create:**

1. `src/components/ui/data-table-filter-popover.tsx`

**Estimated effort:** 2-3 hours

---

### PR 3: Frontend - Integrate Filters into Subscriptions Table

**Files to Modify:**

1. `src/app/finance/subscriptions/data-table.tsx`
   - Remove `selectedProduct` state and product `Select`
   - Add `filterState` with `planType`, `status`, `productName`
   - Set default `planType: 'paid'`
   - Add `derivedFilters` memo
   - Integrate `DataTableFilterPopover`
   - Update `SubscriptionsTableFilters` interface
   - Remove props: `filterOptions`, `activeFilter`, `onFilterChange`

2. `src/app/finance/subscriptions/page.tsx`
   - Remove `activeFilter` state
   - Remove `filterOptions` array
   - Remove `getFilterForTab` function
   - Simplify to just render `<SubscriptionsDataTable />`

**Test Cases:** Manual browser testing
- Page loads with "Paid only" active (free subscriptions hidden)
- Filter button opens popover
- Plan Type changes filter correctly
- Status changes filter correctly
- Product changes filter correctly
- Combined filters work
- Badge shows correct count
- Reset restores defaults
- Pagination resets on filter change

**Estimated effort:** 1-2 hours

---

## Parallelization

```
PR 1 (Backend) ─────┐
                    ├──> PR 3 (Integration)
PR 2 (Component) ───┘
```

- **PR 1 and PR 2 can be developed in parallel**
- **PR 3 depends on both PR 1 and PR 2**

**Total estimated effort:** ~4-5 hours
