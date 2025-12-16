# Gameplan: Reusable Data Table Filter Component

## Current State Analysis

### What Exists Today

**Filter UI Components:**
- `FilterButtonGroup` - Used for status tabs (subscriptions, invoices)
- Individual `Select` dropdowns - Used for product selection
- `CollapsibleSearch` - Debounced search input

**Issues with Current Approach:**
1. **Scattered controls** - Filters are spread across toolbar (status tabs + dropdown + search)
2. **No unified pattern** - Each table implements filters differently
3. **No default filter support** - Tables show all data by default
4. **Growing toolbar clutter** - As more filters are added, toolbar becomes crowded

**Tables that Need Filters:**
| Table | Current Filters | Needed Filters |
|-------|-----------------|----------------|
| Subscriptions | Status tabs, Product dropdown | Plan Type (paid/free), Status, Product |
| Invoices | Status tabs | Status, Customer, Date range |
| Payments | Status tabs | Status, Customer, Date range |
| Customers | None | Archived toggle, Pricing Model |
| Products | Archive toggle | Archive toggle, Type |

### Backend Filter Architecture (Important)

The codebase uses `sanitizeBaseTableFilters` + `whereClauseFromObject` for automatic column filtering:

```ts
// Direct column filters (status, customerId, isFreePlan) are automatically handled:
// 1. sanitizeBaseTableFilters keeps only columns that exist on the table
// 2. whereClauseFromObject builds eq() conditions for each filter

// Cross-table filters (productName) require buildAdditionalFilterClause:
// Used for filters that need JOINs or EXISTS subqueries
```

**Key insight:** Adding a new filter for a direct table column only requires:
1. Adding to tRPC input schema
2. Adding to the table's filter type definition

No SQL handler changes needed for direct columns.

---

## Required Changes

### 1. Create Reusable Filter Popover Component

**File to Create:** `src/components/ui/data-table-filter-popover.tsx`

**Component Signature:**

```ts
// Filter section types - extensible for future needs
interface BaseFilterSection {
  id: string
  label: string
  disabled?: boolean
}

interface SingleSelectFilterSection extends BaseFilterSection {
  type: 'single-select'
  options: { value: string; label: string }[]
}

interface ToggleFilterSection extends BaseFilterSection {
  type: 'toggle'
  description?: string  // Shown below the toggle
}

interface AsyncSelectFilterSection extends BaseFilterSection {
  type: 'async-select'
  loadOptions: () => Promise<{ value: string; label: string }[]>
  isLoading?: boolean
  placeholder?: string
}

type FilterSection = 
  | SingleSelectFilterSection 
  | ToggleFilterSection 
  | AsyncSelectFilterSection

// Main component props
interface DataTableFilterPopoverProps<T extends Record<string, unknown>> {
  /** Filter sections to render */
  sections: FilterSection[]
  /** Current filter values */
  values: T
  /** Called when any filter value changes */
  onChange: (values: T) => void
  /** Default values - used for reset and badge calculation */
  defaultValues: T
  /** Disabled state */
  disabled?: boolean
  /** Custom trigger label (default: "Filter") */
  triggerLabel?: string
  /** Whether to show active filter count badge (default: true) */
  showBadge?: boolean
}

export function DataTableFilterPopover<T extends Record<string, unknown>>({
  sections,
  values,
  onChange,
  defaultValues,
  disabled,
  triggerLabel = 'Filter',
  showBadge = true,
}: DataTableFilterPopoverProps<T>): React.ReactElement
```

**UI Structure:**

```
┌──────────────────────────────────────────┐
│  [Filter ▼] (1)  ← Badge shows count     │
└──────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────┐
│  Section Label                           │
│  ○ Option 1                              │
│  ● Option 2 (selected)                   │
│  ○ Option 3                              │
├──────────────────────────────────────────┤
│  Toggle Section                          │
│  [═══○   ] Show archived                 │
├──────────────────────────────────────────┤
│  Async Section                           │
│  ○ All items                             │
│  ○ Item A                                │
│  ○ Item B (loaded from API)              │
├──────────────────────────────────────────┤
│                         [Reset filters]  │
└──────────────────────────────────────────┘
```

**Implementation Details:**

1. Uses Radix `Popover` for container
2. Uses `RadioGroup` for single-select sections
3. Uses `Switch` for toggle sections
4. Shows "Reset filters" link only when values differ from defaults
5. Badge count = number of fields that differ from defaults
6. Sections separated by subtle dividers

---

## Acceptance Criteria

- [ ] `DataTableFilterPopover` component created and exported
- [ ] Supports `single-select` filter type with radio buttons
- [ ] Supports `toggle` filter type with switch component
- [ ] Supports `async-select` filter type with loading state
- [ ] Shows badge with count when filters differ from defaults
- [ ] "Reset filters" link appears when filters differ from defaults
- [ ] Reset restores all filters to default values
- [ ] Component is fully typed with generics
- [ ] Popover closes when clicking outside
- [ ] Keyboard accessible (Escape to close, Tab navigation)

---

## Open Questions

1. **Should we support multi-select (checkboxes)?**
   - **Proposed:** Defer to future PR. Single-select covers current needs.

2. **Should filter state persist in URL params?**
   - **Proposed:** Defer to future PR. Start with in-memory state.

3. **Should the popover auto-close on selection?**
   - **Proposed:** No. Keep open for multi-filter changes. Close on outside click.

---

## Explicit Opinions

1. **Single "Filter" button pattern** - Consolidates all filters into one popover. Reduces toolbar clutter. Follows patterns from Linear, Notion, and other modern apps.

2. **Extensible section types** - Start with `single-select`, `toggle`, and `async-select`. Architecture supports adding `multi-select`, `date-range`, etc. later.

3. **Badge shows deviation from defaults** - Only count filters that differ from default values. This makes "Paid only" as default not show as an active filter.

4. **Reset to defaults, not clear all** - "Reset" returns to sensible defaults, not empty filters. Each table defines its own defaults.

5. **Generic component** - Fully typed with generics so each table can define its own filter shape.

6. **Server-side filtering only** - Component manages UI state. Actual filtering happens server-side via existing tRPC + table methods infrastructure.

---

## PRs

### PR 1: Create DataTableFilterPopover Component

**Files to Create:**

1. `src/components/ui/data-table-filter-popover.tsx`
   - Main component implementation
   - Uses Radix Popover, RadioGroup, Switch
   - Exports types for sections and props

**Dependencies:** None - can be built standalone

**Test Cases:**

```ts
// File: src/components/ui/data-table-filter-popover.test.tsx
// Note: Component tests using React Testing Library

describe('DataTableFilterPopover', () => {
  describe('rendering', () => {
    it('should render trigger button with label', () => {
      // Setup: Render with triggerLabel="Filter"
      // Expect: Button with text "Filter" visible
    })
    
    it('should show badge when values differ from defaults', () => {
      // Setup: Render with values !== defaultValues
      // Expect: Badge visible with correct count
    })
    
    it('should not show badge when values equal defaults', () => {
      // Setup: Render with values === defaultValues
      // Expect: No badge visible
    })
  })
  
  describe('single-select sections', () => {
    it('should render radio options for single-select type', () => {
      // Setup: Render with single-select section
      // Expect: RadioGroup with options visible
    })
    
    it('should call onChange when option selected', () => {
      // Setup: Render with onChange spy
      // Action: Click option
      // Expect: onChange called with updated values
    })
  })
  
  describe('toggle sections', () => {
    it('should render switch for toggle type', () => {
      // Setup: Render with toggle section
      // Expect: Switch component visible
    })
    
    it('should call onChange when toggle changed', () => {
      // Setup: Render with onChange spy
      // Action: Toggle switch
      // Expect: onChange called with boolean value
    })
  })
  
  describe('reset functionality', () => {
    it('should show reset link when values differ from defaults', () => {
      // Setup: Render with values !== defaultValues
      // Expect: "Reset filters" link visible
    })
    
    it('should restore defaults when reset clicked', () => {
      // Setup: Render with modified values
      // Action: Click reset
      // Expect: onChange called with defaultValues
    })
  })
})
```

**Estimated effort:** 2-3 hours

---

## Parallelization

This is a standalone component PR with no dependencies. It can be developed in parallel with any backend filter work.

```
PR 1 (Component) ───> Ready for integration into any table
```

---

## Usage Example

Once built, tables integrate like this:

```tsx
// In any data-table.tsx file
const [filterState, setFilterState] = useState({
  status: 'all',
  showArchived: false,
})

const defaultFilterValues = {
  status: 'all',
  showArchived: false,
}

// In toolbar:
<DataTableFilterPopover
  sections={[
    {
      id: 'status',
      type: 'single-select',
      label: 'Status',
      options: [
        { value: 'all', label: 'All' },
        { value: 'active', label: 'Active' },
        { value: 'canceled', label: 'Canceled' },
      ],
    },
    {
      id: 'showArchived',
      type: 'toggle',
      label: 'Archived',
      description: 'Show archived items',
    },
  ]}
  values={filterState}
  onChange={setFilterState}
  defaultValues={defaultFilterValues}
/>
```

