# Frontend-Only Shadcn Table Migration Guide

## Executive Summary

This guide provides step-by-step instructions for **cherry-picking Shadcn frontend patterns** from the `data-table-refactor` branch **without making any backend, database, or API changes**. This is a pure frontend refactor that adopts modern table patterns while preserving all existing backend functionality.

**Purpose**: Migrate tables to Shadcn best practices (frontend-only)  
**Reference**: `data-table-refactor` branch (13 tables already refactored)  
**Method**: Cherry-pick frontend patterns, skip backend changes  
**Based on**: Successful customers table migration (completed Oct 2025)  
**Time Estimate**: 30-60 minutes per table  
**Risk Level**: Low (zero backend impact)

---

## 📌 About the `data-table-refactor` Branch

**Important Context**: Most tables have already been refactored to Shadcn patterns in the `data-table-refactor` branch. However, **that branch was abandoned** because it also made backend, API, and database changes that we don't want to implement.

**What we're doing**: Cherry-picking the **frontend patterns only** from that branch while avoiding any backend changes.

**How to access reference files from that branch**:

```bash
# Fetch the branch (if not already fetched)
git fetch origin data-table-refactor

# View a file from the branch without checking it out
git show origin/data-table-refactor:platform/flowglad-next/src/app/[table-name]/columns.tsx
git show origin/data-table-refactor:platform/flowglad-next/src/app/[table-name]/data-table.tsx
git show origin/data-table-refactor:platform/flowglad-next/src/app/[table-name]/Internal.tsx

# Examples:
git show origin/data-table-refactor:platform/flowglad-next/src/app/customers/columns.tsx
git show origin/data-table-refactor:platform/flowglad-next/src/app/store/products/columns.tsx
git show origin/data-table-refactor:platform/flowglad-next/src/app/finance/payments/columns.tsx
```

**Tables already refactored in that branch** (use as reference):
- ✅ Customers (completed in main branch)
- ✅ Products
- ✅ Subscriptions
- ✅ Payments
- ✅ Invoices
- ✅ Features
- ✅ Prices
- ✅ Discounts
- ✅ Webhooks
- ✅ API Keys
- ✅ Usage Meters
- ✅ Pricing Models
- ✅ Organization Members

**Additional tables found (not in reference branch - need manual migration)**:
- ⚠️ Subscription Items (detail page table)
- ⚠️ Usage Events (detail page table)
- ⚠️ Purchases (customer detail page - different from main Purchases table)

**Why use git commands instead of GitHub UI?**  
The GitHub web interface had issues displaying these files, but git commands work reliably to access the reference implementations.

---

## When to Use This Guide

✅ **Use this approach when:**
- You want to improve frontend code quality without touching backend
- You want to adopt Shadcn component patterns
- You want to standardize table implementations across the app
- Backend is working fine and doesn't need changes
- You're refactoring tables that have pagination but may not have search

❌ **Don't use this approach when:**
- You need to change database queries or indexes
- You need to modify tRPC endpoints or schemas
- You're building a table from scratch

---

## 🔍 Important: Search Support Status

**As of Oct 2025, only the CUSTOMERS table has backend search support.**

All other tables (Products, Subscriptions, Payments, Invoices, Features, Prices, Discounts, Webhooks, API Keys, Usage Meters, Pricing Models, Organization Members) do **NOT** have backend search configured.

**What this means for your migration:**
- ✅ **Customers table**: Include search with `CollapsibleSearch` component
- ⚠️ **All other tables**: Follow the "Tables WITHOUT Search" pattern (omit search code)

If you want to add search to other tables, that requires backend changes. See `shadcn-data-table-gameplan.md` for instructions on adding backend search support.

---

## Prerequisites

### Required Components (Already Built)
These components should already exist in your project:

- ✅ `components/ui/collapsible-search.tsx` - Search input with loading states
- ✅ `components/ui/enhanced-data-table-actions-menu.tsx` - Action menu with modal support
- ✅ `components/ui/data-table-copyable-cell.tsx` - Copyable cell with copy button
- ✅ `components/ui/data-table-pagination.tsx` - Pagination with smart visibility
- ✅ `components/ui/data-table-view-options.tsx` - Column visibility toggle
- ✅ `app/hooks/useDebounce.ts` - Stable debounce hook
- ✅ `app/hooks/useSearchDebounce.ts` - Search-specific debounce hook

### Required Knowledge
- Current table location and structure
- Existing action menu items and modals
- Filter interfaces being used
- Column data structure (nested vs flat properties)

---

## 🚨 CRITICAL: Table Layout Fixed Property & Column Sizing

**⚠️ EVERY table MUST include `style={{ tableLayout: 'fixed' }}` on the `<Table>` element.**

### Why This Is Critical

Without `tableLayout: 'fixed'`, all your column sizing will be **silently broken**:

```tsx
// ❌ BROKEN - Browser ignores all your width settings
<Table>
  <TableHead style={{ width: header.getSize() }}>

// ✅ CORRECT - Browser respects your width settings  
<Table className="w-full" style={{ tableLayout: 'fixed' }}>
  <TableHead style={{ width: header.getSize() }}>
```

### The Problem Explained

HTML tables have two layout algorithms:

**1. `table-layout: auto` (browser default)** ❌
- Browser **ignores** explicit width values
- Calculates widths based on **content**
- All your `size`/`minSize`/`maxSize` properties are **useless**
- Columns jump around as data changes

**2. `table-layout: fixed` (what we need)** ✅
- Browser **respects** explicit width values
- Uses header row widths for ALL rows
- Your TanStack sizing properties **work correctly**
- Consistent column widths across all data

### Understanding TanStack Table Sizing Features

TanStack Table provides **two complementary sizing features**:

1. **Responsive Sizing (Always Active)**: Columns automatically adapt to container width based on your `size`/`minSize`/`maxSize` definitions
2. **Interactive Resizing (Optional)**: Users can manually drag column headers to adjust widths

Both features are enabled by the same configuration (`enableColumnResizing: true`), but interactive resizing requires additional UI implementation (resize handles).

### Real Example

```typescript
// Your column definition
{
  id: 'email',
  size: 220,
  minSize: 180,
  maxSize: 250,
  cell: ({ row }) => (
    <div className="truncate">{row.getValue('email')}</div>
  )
}

// WITHOUT tableLayout: 'fixed'
// Result: Column becomes 352px (browser decides based on content)
// Your maxSize: 250 is COMPLETELY IGNORED ❌

// WITH tableLayout: 'fixed'
// Result: Column is exactly 220px
// Content truncates with ellipsis if too long ✅
```

### The "Silent Failure" Trap

This is especially dangerous because **tables look fine without it**:
- ✅ Table renders
- ✅ Data displays
- ✅ No console errors
- ❌ But all sizing is broken

You won't notice until:
- Content changes and columns jump sizes
- You set a maxSize and it's ignored
- Layout is inconsistent across pages

### Remember

**ALWAYS include in every data-table.tsx:**

```tsx
<Table style={{ tableLayout: 'fixed' }}>
```

This is the **bridge** between TanStack Table's sizing calculations and the browser's rendering engine. Without it, they don't communicate! 🌉

### Column Sizing Properties Deep Dive

**Understanding Column Sizing:**

```typescript
{
  id: 'email',
  size: 220,      // Base width - used for space distribution calculations
  minSize: 120,   // Enforced minimum (responsive shrinking stops here)
  maxSize: 250,   // CAVEAT: Ignored during automatic space distribution!
  enableResizing: false,  // Optional: Prevents user drag-to-resize (valid property!)
}
```

**Critical Insight: How Extra Space is Distributed**

TanStack Table's space distribution algorithm has an important quirk:

1. Calculates total needed space: `sum of all column.size values`
2. If `container width > total needed space` → extra space exists
3. Distributes extra space **proportionally** based on `size` ratios
4. **`maxSize` constraints are IGNORED during this distribution** ⚠️

**Example:**
```typescript
// Container: 1200px
// Column A: size: 300 (gets 300/600 = 50% of extra space)
// Column B: size: 300 (gets 300/600 = 50% of extra space)
// Total needed: 600px
// Extra space: 600px
// Result: Both columns become 600px (even if maxSize: 400!)
```

**How to Control Space Distribution:**

Use strategic `size` values to prioritize which columns should grow:

```typescript
// High priority column (gets more extra space)
{
  id: 'name',
  size: 300,        // Higher base = more proportional growth
  minSize: 120,
  maxSize: 500,
}

// Constrained column (gets less extra space)
{
  id: 'email',
  size: 200,        // Lower base = less proportional growth
  minSize: 180,
  maxSize: 250,
}

// Fixed width column (no growth)
{
  id: 'actions',
  size: 1,          // Minimal base
  minSize: 56,
  maxSize: 56,
  enableResizing: false,  // Prevent user resizing too
}
```

**Column Sizing by Content Type:**

| Content Type | Recommended Base Size | Strategy |
|--------------|----------------------|----------|
| Names/Titles | 200-300px | Allow expansion for readability |
| Email Addresses | 220px | Moderate constraint |
| IDs/Keys | 120-180px | Can truncate heavily |
| Currency/Numbers | 100px | Fixed, no expansion needed |
| Dates | 100px | Consistent format, minimal expansion |
| Status Badges | 100-110px | Fixed width |
| Actions | 1-50px | Fixed at minSize, no expansion |

**Interactive Resizing (Optional Feature):**

The `enableResizing` property controls whether users can manually drag column borders:

```typescript
{
  id: 'actions',
  enableResizing: false,  // ✅ VALID property - prevents manual resizing
  // Note: This is separate from responsive sizing
}
```

- Set `enableResizing: false` on fixed-width columns (actions, icons)
- Default is `true` (columns are resizable if you implement resize handles)
- This only affects **user drag-to-resize**, not automatic responsive sizing

**For Complete Column Sizing Documentation:**

See `docs/guides/table-sizing-guide.md` for:
- Detailed space distribution algorithm explanation
- Interactive resizing implementation guide
- Performance optimization strategies
- Advanced techniques and troubleshooting

---

## Migration Steps

### Step 1: Review Reference Implementation (If Available)

**First, check if your table was already refactored in the `data-table-refactor` branch:**

```bash
# Check if columns.tsx exists for your table in the reference branch
git show origin/data-table-refactor:platform/flowglad-next/src/app/[your-path]/columns.tsx

# Check if data-table.tsx exists
git show origin/data-table-refactor:platform/flowglad-next/src/app/[your-path]/data-table.tsx

# Check Internal.tsx or page.tsx
git show origin/data-table-refactor:platform/flowglad-next/src/app/[your-path]/Internal.tsx
```

**If the table exists in the reference branch:**
1. ✅ Use it as your primary reference
2. ✅ Copy the frontend patterns (columns, data-table structure)
3. ⚠️ **SKIP any backend/API changes** from that branch
4. ✅ Verify the patterns match this guide's recommendations

**If the table doesn't exist in the reference branch:**
1. Follow this guide's step-by-step instructions
2. Use the customers table as your reference
3. Adapt the patterns to your table's data structure

---

### Step 2: Analyze Current Implementation

Before starting, document your current table:

```bash
# First, find ALL usages of your table component
grep -r "YourTableName" src/app/

# Common patterns:
# - import statements
# - component usage in JSX
# - type imports
```

```markdown
## Current Implementation Analysis

**Table Location**: `src/app/[path]/[TableName]Table.tsx`

**All Usage Locations**:
1. Main listing page: `src/app/[path]/Internal.tsx` or `page.tsx`
2. Detail page 1: `src/app/[other-path]/[id]/page.tsx` (if applicable)
3. Detail page 2: `src/app/[another-path]/[id]/page.tsx` (if applicable)
4. [Add more as needed]

**Search**: ⚠️ [Yes ONLY if this is the CUSTOMERS table / No for all other tables]
**Filters**: [List filter fields]
**Action Menu Items**: [List actions]
**Special Features**: [Images, nested data, conditional actions, etc.]

**Columns to Migrate**:
| Current Column | Type | Notes |
|----------------|------|-------|
| `customer.name` | nested | Use accessorFn |
| `email` | flat + copyable | Use DataTableCopyableCell |
| ... | ... | ... |

**Usage Patterns to Update**:
| Location | Current Pattern | Needs Update |
|----------|----------------|--------------|
| Main listing | Uses `<TableHeader>` above table | ✅ Remove, use `onCreateEntity` |
| Detail page 1 | Uses `<TableHeader>` above table | ✅ Remove, add filters |
| Detail page 2 | Direct table usage | ✅ Add `onCreateEntity` prop |
```

### Step 3: Create `columns.tsx`

**If your table exists in `data-table-refactor` branch:**

```bash
# View the reference implementation
git show origin/data-table-refactor:platform/flowglad-next/src/app/[your-path]/columns.tsx > reference-columns.txt

# Review it, then copy the patterns (ensuring no backend dependencies)
```

**Create a new file `[path]/columns.tsx` following this structure:**

```typescript
'use client'

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
// Icons come next
import { Pencil, Copy, Trash } from 'lucide-react'
// UI components last
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import { DataTableLinkableCell } from '@/components/ui/data-table-linkable-cell'
import {
  EnhancedDataTableActionsMenu,
  ActionMenuItem,
} from '@/components/ui/enhanced-data-table-actions-menu'
// Other imports
import { YourDataType } from '@/db/schema/[entity]'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import EditModal from '@/components/forms/EditModal'
// ... other imports

// Action menu component
function EntityActionsMenu({ entity }: { entity: YourEntityType }) {
  const [isEditOpen, setIsEditOpen] = React.useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false)

  const copyIDHandler = useCopyTextHandler({
    text: entity.id,
  })

  const actionItems: ActionMenuItem[] = [
    {
      label: 'Edit [Entity]',
      icon: <Pencil className="h-4 w-4" />,
      handler: () => setIsEditOpen(true),
    },
    {
      label: 'Copy ID',
      icon: <Copy className="h-4 w-4" />,
      handler: copyIDHandler,
    },
    {
      label: 'Delete [Entity]',
      icon: <Trash className="h-4 w-4" />,
      handler: () => setIsDeleteOpen(true),
      destructive: true,
      disabled: entity.someCondition, // Optional
      helperText: 'Cannot delete while active', // Optional
    },
  ]

  return (
    <EnhancedDataTableActionsMenu items={actionItems}>
      <EditModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        entity={entity}
      />
      <DeleteModal
        isOpen={isDeleteOpen}
        setIsOpen={setIsDeleteOpen}
        entity={entity}
      />
    </EnhancedDataTableActionsMenu>
  )
}

// Column definitions
export const columns: ColumnDef<YourTableRowDataType>[] = [
  // PATTERN 1: Nested property (use accessorFn)
  {
    id: 'name',
    accessorFn: (row) => row.entity.name,
    header: 'Name',
    cell: ({ row }) => (
      <div className="truncate" title={row.getValue('name')}>
        {row.getValue('name')}
      </div>
    ),
    size: 200,     // Base width - affects space distribution
    minSize: 140,  // Minimum when container shrinks
    maxSize: 400,  // Maximum when container expands (see note below*)
  },
  // *Note: maxSize is ignored during automatic space distribution
  // Use size ratios to control which columns grow more
  
  // PATTERN 2: Nested property + copyable
  {
    id: 'email',
    accessorFn: (row) => row.entity.email,
    header: 'Email',
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <DataTableCopyableCell
          copyText={row.getValue('email')}
          className="lowercase"
        >
          {row.getValue('email')}
        </DataTableCopyableCell>
      </div>
    ),
    size: 220,
    minSize: 120,
    maxSize: 250,
  },
  
  // PATTERN 3: Flat property with formatting
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue('amount') || '0')
      const formatted = formatCurrency(amount)
      return <div className="whitespace-nowrap">{formatted}</div>
    },
    size: 100,
    minSize: 80,
    maxSize: 120,
  },
  
  // PATTERN 4: Flat property with badge
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={getStatusVariant(row.getValue('status'))}>
        {sentenceCase(row.getValue('status'))}
      </Badge>
    ),
    size: 100,
  },
  
  // PATTERN 5: Nested property with date formatting
  {
    id: 'createdAt',
    accessorFn: (row) => row.entity.createdAt,
    header: 'Created',
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        {formatDate(row.getValue('createdAt'))}
      </div>
    ),
    size: 100,
    minSize: 100,
    maxSize: 150,
  },
  
  // PATTERN 6: Nested ID column (copyable)
  {
    id: 'entityId',
    accessorFn: (row) => row.entity.id,
    header: 'ID',
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <DataTableCopyableCell copyText={row.getValue('entityId')}>
          {row.getValue('entityId')}
        </DataTableCopyableCell>
      </div>
    ),
    size: 120,
    minSize: 80,
    maxSize: 180,
  },
  
  // PATTERN 7: Customer name with link (for tables with customer data)
  {
    id: 'customerName',
    accessorFn: (row) => row.customer.name,
    header: 'Customer',
    cell: ({ row }) => {
      const customer = row.original.customer
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <DataTableLinkableCell href={`/customers/${customer.id}`}>
            {customer.name}
          </DataTableLinkableCell>
        </div>
      )
    },
    size: 150,
    minSize: 120,
    maxSize: 200,
  },
  
  // PATTERN 8: Actions column (always last)
  {
    id: 'actions',
    enableHiding: false,
    enableResizing: false,  // ✅ Prevents user drag-to-resize for this column
    cell: ({ row }) => {
      const entity = row.original.entity
      return (
        <div
          className="w-8 flex justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <EntityActionsMenu entity={entity} />
        </div>
      )
    },
    size: 1,       // Minimal base size
    minSize: 56,   // Actual minimum width
    maxSize: 56,   // Fixed width (no expansion)
  },
]
```

### Step 4: Create `data-table.tsx`

**If your table exists in `data-table-refactor` branch:**

```bash
# View the reference implementation
git show origin/data-table-refactor:platform/flowglad-next/src/app/[your-path]/data-table.tsx > reference-data-table.txt

# Review it, paying attention to:
# - Search implementation (remove if not customers table)
# - Filter patterns
# - Pagination setup
# - Toolbar structure
```

**Create a new file `[path]/data-table.tsx`:**

```typescript
'use client'

import * as React from 'react'
import {
  ColumnFiltersState,
  ColumnSizingState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { CollapsibleSearch } from '@/components/ui/collapsible-search'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTableViewOptions } from '@/components/ui/data-table-view-options'
import { DataTablePagination } from '@/components/ui/data-table-pagination'
import { columns } from './columns'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { useSearchDebounce } from '@/app/hooks/useSearchDebounce'
import { trpc } from '@/app/_trpc/client'
import { YourTableRowDataType } from '@/db/schema/[entity]'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

// Define your filter interface
export interface YourTableFilters {
  archived?: boolean
  organizationId?: string
  // ... other filters
}

interface YourDataTableProps {
  filters?: YourTableFilters
  title?: string  // For displaying section title on detail pages
  onCreateEntity?: () => void
}

export function YourDataTable({
  filters = {},
  title,
  onCreateEntity,
}: YourDataTableProps) {
  const router = useRouter()

  // ⚠️ ONLY FOR CUSTOMERS TABLE - Other tables don't have backend search
  // Server-side search (if backend supports it)
  const { inputValue, setInputValue, searchQuery } =
    useSearchDebounce(1000)

  // Page size state for server-side pagination
  const [currentPageSize, setCurrentPageSize] = React.useState(10)

  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    goToFirstPage,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    YourTableRowDataType,
    YourTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: currentPageSize,
    filters: filters,
    searchQuery: searchQuery, // ⚠️ ONLY for customers table
    useQuery: trpc.yourEntity.getTableRows.useQuery,
  })

  // Reset to first page when filters change
  // Use JSON.stringify to get stable comparison of filter object
  const filtersKey = JSON.stringify(filters)
  React.useEffect(() => {
    goToFirstPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey])

  // Client-side features (Shadcn patterns)
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [columnSizing, setColumnSizing] =
    React.useState<ColumnSizingState>({})

  const table = useReactTable({
    data: data?.items || [],
    columns,
    enableColumnResizing: true,  // ✅ Enables responsive sizing (+ interactive if you add resize handles)
    columnResizeMode: 'onEnd',   // ✅ Better performance for manual resizing
    defaultColumn: {
      size: 150,      // Default width (TanStack default: 150)
      minSize: 20,    // Minimum width (TanStack default: 20)
      maxSize: 500,   // Maximum width (TanStack default: Number.MAX_SAFE_INTEGER - we override for sanity)
    },
    manualPagination: true, // Server-side pagination
    manualSorting: false, // Client-side sorting on current page
    manualFiltering: false, // Client-side filtering on current page
    pageCount: Math.ceil((data?.total || 0) / currentPageSize),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: (updater) => {
      const newPagination =
        typeof updater === 'function'
          ? updater({ pageIndex, pageSize: currentPageSize })
          : updater

      // Handle page size changes
      if (newPagination.pageSize !== currentPageSize) {
        setCurrentPageSize(newPagination.pageSize)
        goToFirstPage() // Properly clears both cursors to avoid stale pagination state
      }
      // Handle page index changes (page navigation)
      else if (newPagination.pageIndex !== pageIndex) {
        handlePaginationChange(newPagination.pageIndex)
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnSizing,
      pagination: { pageIndex, pageSize: currentPageSize },
    },
  })

  return (
    <div className="w-full">
      {/* Enhanced toolbar */}
      <div className="flex items-center justify-between pt-4 pb-3 gap-4 min-w-0">
        {/* Title on the left (for detail pages) */}
        <div className="flex items-center gap-4 min-w-0 flex-shrink overflow-hidden">
          {title && (
            <h3 className="text-lg font-semibold whitespace-nowrap">
              {title}
            </h3>
          )}
        </div>
        
        {/* Controls on the right */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* ⚠️ ONLY for customers table - remove for other tables */}
          <CollapsibleSearch
            value={inputValue}
            onChange={setInputValue}
            placeholder="Search [entities]..."
            disabled={isLoading}
            isLoading={isFetching}
          />
          <DataTableViewOptions table={table} />
          {onCreateEntity && (
            <Button onClick={onCreateEntity}>
              <Plus className="w-4 h-4 mr-2" />
              Create [Entity]
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <Table className="w-full" style={{ tableLayout: 'fixed' }}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className="hover:bg-transparent"
            >
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                Loading...
              </TableCell>
            </TableRow>
          ) : table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className={`cursor-pointer ${isFetching ? 'opacity-50' : ''}`}
                onClick={(e) => {
                  // Only navigate if not clicking on interactive elements
                  const target = e.target as HTMLElement
                  if (
                    target.closest('button') ||
                    target.closest('[role="checkbox"]') ||
                    target.closest('input[type="checkbox"]') ||
                    target.closest('[data-radix-collection-item]')
                  ) {
                    return
                  }
                  router.push(`/[path]/${row.original.entity.id}`)
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext()
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="py-2">
        <DataTablePagination
          table={table}
          totalCount={data?.total}
          isFiltered={
            !!searchQuery || Object.keys(filters).length > 0  // ⚠️ Remove searchQuery for tables without search
          }
          filteredCount={data?.total}
        />
      </div>
    </div>
  )
}
```

### Step 5: Update `Internal.tsx` or `page.tsx`

**If your table exists in `data-table-refactor` branch:**

```bash
# View the reference implementation
git show origin/data-table-refactor:platform/flowglad-next/src/app/[your-path]/Internal.tsx

# Note the changes to:
# - Import statements
# - PageHeader (action prop removed)
# - Data table props (onCreateEntity callback)
```

**Update your page component to use the new data table:**

```typescript
'use client'
import { useState } from 'react'
import CreateEntityFormModal from '@/components/forms/CreateEntityFormModal'
import InternalPageContainer from '@/components/InternalPageContainer'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { YourDataTable } from './data-table' // ✅ NEW IMPORT
import { PageHeader } from '@/components/ui/page-header'
import Breadcrumb from '@/components/navigation/Breadcrumb'

function Internal() {
  const { organization } = useAuthenticatedContext()
  const [isCreateEntityOpen, setIsCreateEntityOpen] = useState(false)

  const filters = {
    organizationId: organization?.id!,
    // ... other filters
  }

  return (
    <>
      <InternalPageContainer>
        <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
          <Breadcrumb />
          <PageHeader title="[Entities]" /> {/* ✅ REMOVED action prop */}
          <div>
            <YourDataTable
              filters={filters}
              onCreateEntity={() => setIsCreateEntityOpen(true)} {/* ✅ PASS CALLBACK */}
            />
          </div>
        </div>
      </InternalPageContainer>
      <CreateEntityFormModal
        isOpen={isCreateEntityOpen}
        setIsOpen={setIsCreateEntityOpen}
      />
    </>
  )
}

export default Internal
```

### Step 6: Find and Update All Table Usages (Including Detail Pages)

**IMPORTANT**: Your table component may be used in multiple places, not just the main listing page. You must update ALL usages to ensure consistency.

#### Find All Usages

```bash
# Search for all imports and usages of your table component
grep -r "YourDataTable" src/app/

# Common places to check:
# - Main listing page (e.g., /app/store/products/page.tsx)
# - Detail pages (e.g., /app/store/pricing-models/[id]/page.tsx)
# - Dashboard pages
# - Related entity pages
```

#### Pattern 1: Main Listing Page (With Filters)

```typescript
// Example: /app/store/products/Internal.tsx
const [activeFilter, setActiveFilter] = useState<string>('all')

const filterOptions = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

const getFilterForTab = (tab: string): YourTableFilters => {
  if (tab === 'all') {
    return {}
  }
  return {
    active: tab === 'active',
  }
}

<YourDataTable
  filters={getFilterForTab(activeFilter)}
  filterOptions={filterOptions}
  activeFilter={activeFilter}
  onFilterChange={setActiveFilter}
  onCreateEntity={() => setIsCreateEntityOpen(true)}
/>
```

#### Pattern 2: Detail Pages (With Base Filter + Optional Status Filters)

**Before (Old Pattern with TableHeader):**
```typescript
// ❌ OLD PATTERN - Don't use
<div className="flex flex-col gap-5">
  <TableHeader
    title="Products"
    buttonLabel="Create Product"
    buttonIcon={<Plus size={16} />}
    buttonOnClick={() => setIsCreateProductModalOpen(true)}
  />
  <ProductsDataTable
    filters={{ pricingModelId: pricingModel.id }}
  />
</div>
```

**After (New Pattern with Filters in Table):**
```typescript
// ✅ NEW PATTERN - Use this
const [activeProductFilter, setActiveProductFilter] = useState<string>('all')

const productFilterOptions = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

const getProductFilterForTab = (tab: string) => {
  const baseFilter = { pricingModelId: pricingModel.id }
  
  if (tab === 'all') {
    return baseFilter
  }

  return {
    ...baseFilter,
    active: tab === 'active',
  }
}

// In JSX:
<div className="flex flex-col gap-5">
  <ProductsDataTable
    filters={getProductFilterForTab(activeProductFilter)}
    filterOptions={productFilterOptions}
    activeFilter={activeProductFilter}
    onFilterChange={setActiveProductFilter}
    onCreateProduct={() => setIsCreateProductModalOpen(true)}
  />
</div>
```

#### Pattern 3: Detail Pages (Without Filters or Create Button)

```typescript
// Example: Read-only table on a detail page
<div className="flex flex-col gap-5">
  <YourDataTable
    title="[Entities]"  // ✅ Add title for section heading
    filters={{ parentEntityId: parentEntity.id }}
    // No onCreateEntity, filterOptions, etc. - just the filters
  />
</div>
```

**⚠️ IMPORTANT**: Always include the `title` prop when using tables on detail pages. This provides a consistent section heading and matches the pattern used by all migrated tables (Payments, Subscriptions, Invoices).

#### Checklist for Each Usage

For **every place** the table is used:

- [ ] **Remove separate `TableHeader` component** (if present)
- [ ] **Pass `onCreateEntity` callback** to move create button into table toolbar
- [ ] **Add filter options** (All/Active/Inactive) if appropriate
- [ ] **Combine base filters with status filters** using a helper function
- [ ] **Test all functionality** (filtering, creating, navigation)

#### Example: Products Table Migration

The Products table is used in at least 2 places:

1. **Main products page**: `/app/store/products/Internal.tsx`
   - ✅ Has filter options (All/Active/Inactive)
   - ✅ Has create button
   - ✅ No base filter (shows all products for org)

2. **Pricing model detail page**: `/app/store/pricing-models/[id]/InnerPricingModelDetailsPage.tsx`
   - ✅ Has filter options (All/Active/Inactive)
   - ✅ Has create button
   - ✅ Has base filter (pricingModelId)

Both usages should follow the same pattern with the table toolbar containing filters and create button.

### Step 7: Delete Old Table Component

Once the new implementation is tested **in all locations**:

```bash
# Delete the old table component
rm src/app/[path]/[TableName]Table.tsx
```

---

## Special Cases and Patterns

### Tables WITHOUT Search (Backend Doesn't Support) - MOST COMMON CASE

**⚠️ IMPORTANT**: As of Oct 2025, **only the CUSTOMERS table** has backend search configured. 

**All other tables (Products, Subscriptions, Payments, Invoices, Features, Prices, Discounts, Webhooks, API Keys, Usage Meters, Pricing Models, Organization Members) should use this pattern.**

Simply omit the search-related code when migrating these tables:

**Note**: The toolbar structure below still includes the title display for detail pages. Keep this pattern even without search.

```typescript
// 1. In data-table.tsx - DON'T import or use search hook:
// ❌ Remove this import:
// import { useSearchDebounce } from '@/app/hooks/useSearchDebounce'

// ❌ Remove this hook call:
// const { inputValue, setInputValue, searchQuery } = useSearchDebounce(1000)

// 2. In usePaginatedTableState - DON'T pass searchQuery:
const { ... } = usePaginatedTableState({
  initialCurrentCursor: undefined,
  pageSize: currentPageSize,
  filters: filters,
  // ❌ Remove searchQuery - backend doesn't support it
  useQuery: trpc.yourEntity.getTableRows.useQuery,
})

// 3. In toolbar - DON'T include CollapsibleSearch:
<div className="flex items-center pt-4 pb-3">
  <div className="flex items-center gap-2 ml-auto">
    {/* ❌ Remove CollapsibleSearch component */}
    <DataTableViewOptions table={table} />
    {onCreateEntity && (
      <Button onClick={onCreateEntity}>
        <Plus className="w-4 h-4 mr-2" />
        Create [Entity]
      </Button>
    )}
  </div>
</div>

// 4. In DataTablePagination - Simplify isFiltered:
<DataTablePagination
  table={table}
  totalCount={data?.total}
  isFiltered={Object.keys(filters).length > 0}  // ✅ Only check filters, not searchQuery
  filteredCount={data?.total}
/>
```

**Complete Example for Tables WITHOUT Search:**

```typescript
'use client'

import * as React from 'react'
import {
  ColumnFiltersState,
  ColumnSizingState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
// ✅ NO CollapsibleSearch import
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTableViewOptions } from '@/components/ui/data-table-view-options'
import { DataTablePagination } from '@/components/ui/data-table-pagination'
import { columns } from './columns'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
// ✅ NO useSearchDebounce import
import { trpc } from '@/app/_trpc/client'
import { YourTableRowDataType } from '@/db/schema/[entity]'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

export interface YourTableFilters {
  archived?: boolean
  organizationId?: string
}

interface YourDataTableProps {
  filters?: YourTableFilters
  onCreateEntity?: () => void
}

export function YourDataTable({
  filters = {},
  onCreateEntity,
}: YourDataTableProps) {
  const router = useRouter()

  // ✅ NO search hook - backend doesn't support it

  // Page size state for server-side pagination
  const [currentPageSize, setCurrentPageSize] = React.useState(10)

  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    goToFirstPage,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<YourTableRowDataType, YourTableFilters>({
    initialCurrentCursor: undefined,
    pageSize: currentPageSize,
    filters: filters,
    // ✅ NO searchQuery - backend doesn't support it
    useQuery: trpc.yourEntity.getTableRows.useQuery,
  })

  // Reset to first page when filters change
  // Use JSON.stringify to get stable comparison of filter object
  const filtersKey = JSON.stringify(filters)
  React.useEffect(() => {
    goToFirstPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey])

  // Client-side features (Shadcn patterns)
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({})

  const table = useReactTable({
    data: data?.items || [],
    columns,
    enableColumnResizing: true,  // ✅ Enables responsive sizing (+ interactive if you add resize handles)
    columnResizeMode: 'onEnd',   // ✅ Better performance for manual resizing
    defaultColumn: {
      size: 150,      // Default width (TanStack default: 150)
      minSize: 20,    // Minimum width (TanStack default: 20)
      maxSize: 500,   // Maximum width (TanStack default: Number.MAX_SAFE_INTEGER - we override for sanity)
    },
    manualPagination: true,
    manualSorting: false,
    manualFiltering: false,
    pageCount: Math.ceil((data?.total || 0) / currentPageSize),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: (updater) => {
      const newPagination =
        typeof updater === 'function'
          ? updater({ pageIndex, pageSize: currentPageSize })
          : updater

      if (newPagination.pageSize !== currentPageSize) {
        setCurrentPageSize(newPagination.pageSize)
        goToFirstPage() // Properly clears both cursors to avoid stale pagination state
      } else if (newPagination.pageIndex !== pageIndex) {
        handlePaginationChange(newPagination.pageIndex)
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnSizing,
      pagination: { pageIndex, pageSize: currentPageSize },
    },
  })

  return (
    <div className="w-full">
      {/* Toolbar WITHOUT search */}
      <div className="flex items-center justify-between pt-4 pb-3 gap-4 min-w-0">
        {/* Title on the left (for detail pages) */}
        <div className="flex items-center gap-4 min-w-0 flex-shrink overflow-hidden">
          {title && (
            <h3 className="text-lg font-semibold whitespace-nowrap">
              {title}
            </h3>
          )}
        </div>
        
        {/* Controls on the right */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* ✅ NO CollapsibleSearch - goes straight to controls */}
          <DataTableViewOptions table={table} />
          {onCreateEntity && (
            <Button onClick={onCreateEntity}>
              <Plus className="w-4 h-4 mr-2" />
              Create [Entity]
            </Button>
          )}
        </div>
      </div>

      {/* Table - same as before */}
      <Table className="w-full" style={{ tableLayout: 'fixed' }}>
        {/* ... table implementation ... */}
      </Table>

      {/* Pagination WITHOUT search filtering */}
      <div className="py-2">
        <DataTablePagination
          table={table}
          totalCount={data?.total}
          isFiltered={Object.keys(filters).length > 0}  {/* ✅ Only filters */}
          filteredCount={data?.total}
        />
      </div>
    </div>
  )
}
```

### Tables With Customer Links

**⚠️ CRITICAL**: If your table displays customer data (Invoices, Payments, Subscriptions, etc.), the customer name column MUST be linkable.

```typescript
// In columns.tsx - Import DataTableLinkableCell
import { DataTableLinkableCell } from '@/components/ui/data-table-linkable-cell'

// Customer column pattern
{
  id: 'customerName',
  accessorFn: (row) => row.customer.name,
  header: 'Customer',
  cell: ({ row }) => {
    const customer = row.original.customer
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <DataTableLinkableCell href={`/customers/${customer.id}`}>
          {customer.name}
        </DataTableLinkableCell>
      </div>
    )
  },
  size: 150,
  minSize: 120,
  maxSize: 200,
},
```

**Why this matters:**
- Provides consistent navigation UX across all tables
- Matches pattern used in Payments, Subscriptions, and Invoices tables
- `stopPropagation` prevents row click from interfering with link click

---

### Tables With Filter Tabs (Active/Archived)

Use `FilterButtonGroup` component:

```typescript
import { FilterButtonGroup } from '@/components/ui/filter-button-group'

// In data-table.tsx
interface YourDataTableProps {
  filters?: YourTableFilters
  onCreateEntity?: () => void
  filterOptions?: { value: string; label: string }[]
  activeFilter?: string
  onFilterChange?: (value: string) => void
}

// In toolbar
<div className="flex items-center justify-between py-4 gap-4 min-w-0">
  <div className="flex items-center min-w-0 flex-shrink overflow-hidden">
    {filterOptions && activeFilter && onFilterChange && (
      <FilterButtonGroup
        options={filterOptions}
        value={activeFilter}
        onValueChange={onFilterChange}
      />
    )}
  </div>
  
  <div className="flex items-center gap-2 flex-shrink-0">
    {/* Search, view options, create button */}
  </div>
</div>

// In Internal.tsx
const [activeTab, setActiveTab] = useState('all')

const filterOptions = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
]

<YourDataTable
  filters={getFiltersForTab(activeTab)}
  filterOptions={filterOptions}
  activeFilter={activeTab}
  onFilterChange={setActiveTab}
  onCreateEntity={() => setIsCreateOpen(true)}
/>
```

### Tables With Image Columns

```typescript
// In columns.tsx
{
  id: 'image',
  accessorFn: (row) => row.product.imageUrl,
  header: 'Image',
  cell: ({ row }) => {
    const imageUrl = row.getValue('image')
    return (
      <div className="w-12 h-12 relative">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt="Product"
            fill
            className="object-cover rounded"
          />
        ) : (
          <div className="w-full h-full bg-muted rounded flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
      </div>
    )
  },
  size: 80,
  maxSize: 80,
},
```

### Tables With Complex Nested Data

```typescript
// In columns.tsx
{
  id: 'prices',
  accessorFn: (row) => row.prices,
  header: 'Prices',
  cell: ({ row }) => {
    const prices = row.getValue('prices') as Price[]
    if (!prices || prices.length === 0) {
      return <span className="text-muted-foreground">No prices</span>
    }
    return (
      <div className="flex flex-col gap-1">
        {prices.slice(0, 2).map((price) => (
          <div key={price.id} className="text-sm">
            {formatCurrency(price.amount)}
          </div>
        ))}
        {prices.length > 2 && (
          <span className="text-xs text-muted-foreground">
            +{prices.length - 2} more
          </span>
        )}
      </div>
    )
  },
  size: 150,
},
```

### Tables Without Row Navigation

If clicking rows shouldn't navigate anywhere, remove the onClick handler:

```typescript
// In data-table.tsx - SIMPLIFIED VERSION
<TableRow
  key={row.id}
  className={isFetching ? 'opacity-50' : ''}
  // ❌ NO onClick handler
>
  {row.getVisibleCells().map((cell) => (
    <TableCell key={cell.id}>
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </TableCell>
  ))}
</TableRow>
```

---

## Critical Patterns to Follow

### ✅ DO: Always Use `tableLayout: 'fixed'`

```tsx
// ✅ CORRECT - REQUIRED for column sizing to work
<Table style={{ tableLayout: 'fixed' }}>
  <TableHeader>
    {table.getHeaderGroups().map((headerGroup) => (
      <TableRow key={headerGroup.id}>
        {headerGroup.headers.map((header) => (
          <TableHead
            key={header.id}
            style={{ width: header.getSize() }} // Only works with tableLayout: fixed
          >
            {/* header content */}
          </TableHead>
        ))}
      </TableRow>
    ))}
  </TableHeader>
</Table>

// ❌ WRONG - Will cause silent sizing failures
<Table>  // Missing tableLayout: 'fixed'
  <TableHeader>...</TableHeader>
</Table>
```

**Why this matters:**
- Without it, browsers ignore your explicit width values
- All `size`/`minSize`/`maxSize` properties become useless
- Columns size based on content, not your definitions
- Creates inconsistent layouts across different data sets
- **Silent failure**: Table looks fine but sizing is broken

### ✅ DO: Use `accessorFn` for Nested Data

```typescript
// ✅ CORRECT
{
  id: 'name',
  accessorFn: (row) => row.customer.name,
  cell: ({ row }) => row.getValue('name')
}

// ❌ WRONG - Will cause runtime errors
{
  accessorKey: 'customer.name',
  cell: ({ row }) => row.getValue('customer.name')
}
```

### ✅ DO: Add `stopPropagation` to Interactive Elements

```typescript
// ✅ CORRECT - Prevents row navigation when clicking buttons
<div onClick={(e) => e.stopPropagation()}>
  <DataTableCopyableCell>...</DataTableCopyableCell>
</div>

<div onClick={(e) => e.stopPropagation()}>
  <EnhancedDataTableActionsMenu>...</EnhancedDataTableActionsMenu>
</div>
```

### ✅ DO: Use Proper Loading State Precedence

```typescript
// ✅ CORRECT - Check isLoading FIRST
{isLoading ? (
  <LoadingRow />
) : table.getRowModel().rows?.length ? (
  <DataRows />
) : (
  <EmptyRow />
)}

// ❌ WRONG - Shows "No results" during loading
{table.getRowModel().rows?.length ? (
  <DataRows />
) : (
  <EmptyRow />
)}
```

### ✅ DO: Return Content Elements in Cell Functions

```typescript
// ✅ CORRECT
cell: ({ row }) => (
  <div className="font-medium">{row.getValue('name')}</div>
)

// ❌ WRONG - Creates invalid HTML
cell: ({ row }) => (
  <TableCell className="font-medium">{row.getValue('name')}</TableCell>
)
```

### ✅ DO: Use `goToFirstPage()` for Reset Operations

```typescript
// Extract goToFirstPage from the hook
const {
  pageIndex,
  pageSize,
  handlePaginationChange,
  goToFirstPage,  // ← Include this
  data,
  isLoading,
  isFetching,
} = usePaginatedTableState({...})

// ✅ CORRECT - Use goToFirstPage() when page size changes
if (newPagination.pageSize !== currentPageSize) {
  setCurrentPageSize(newPagination.pageSize)
  goToFirstPage() // Clears both pageAfter and pageBefore cursors
}

// ❌ WRONG - handlePaginationChange(0) keeps cursor state
if (newPagination.pageSize !== currentPageSize) {
  setCurrentPageSize(newPagination.pageSize)
  handlePaginationChange(0) // Bug: Can fetch wrong data with stale cursors
}
```

**Why this matters**: When on a later page (e.g., page 3), calling `handlePaginationChange(0)` treats it as backward navigation and keeps the `pageBefore` cursor from page 3. This causes the query to fetch incorrect data. Using `goToFirstPage()` properly clears all cursor state and resets navigation flags.

### ✅ DO: Avoid Fixed CSS Widths in Cell Content

```typescript
// ❌ WRONG - Fixed CSS widths conflict with TanStack sizing
cell: ({ row }) => (
  <div className="min-w-[105px] max-w-[120px]">
    <PricingCellView prices={row.getValue('prices')} />
  </div>
)

// ✅ CORRECT - Let column width control size
cell: ({ row }) => (
  <div className="truncate">
    <PricingCellView prices={row.getValue('prices')} />
  </div>
)
```

**Why this matters**: Fixed `min-w-*` and `max-w-*` classes on cell content override TanStack's dynamic column sizing. The column may size correctly, but content inside will have its own fixed constraints, causing premature truncation or layout issues.

### ✅ DO: Use Block Elements for Truncation

```typescript
// ❌ WRONG - Truncation won't work on inline elements
cell: ({ row }) => (
  <span className="truncate" title={content}>
    {content}
  </span>
)

// ✅ CORRECT - Use div (block element)
cell: ({ row }) => (
  <div className="truncate" title={content}>
    {content}
  </div>
)

// ✅ ALSO CORRECT - Make span block-level
cell: ({ row }) => (
  <span className="block truncate" title={content}>
    {content}
  </span>
)
```

**Why this matters**: The `truncate` class (`text-overflow: ellipsis`, `overflow: hidden`, `white-space: nowrap`) only works on block-level or inline-block elements, not inline elements.

### ✅ DO: Reset Pagination When Filters Change

**CRITICAL**: When the `filters` prop changes, the table must reset to the first page. Otherwise, it will try to use pagination cursors from the old filter set, which returns the wrong data slice.

```typescript
// ✅ CORRECT - Reset pagination when filters change
const filtersKey = JSON.stringify(filters)
React.useEffect(() => {
  goToFirstPage()
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [filtersKey])

// ❌ WRONG - Missing filter reset effect
// When filters change, table keeps old cursors and fetches wrong data
```

**Why this matters**: 
- When filters change (e.g., switching from "All" to "Active"), the result set changes completely
- Old pagination cursors (`pageAfter`, `pageBefore`) are meaningless in the new filter context
- Without resetting, the query sends `{ filters: NEW, pageAfter: OLD_CURSOR }` which returns incorrect data
- This bug is especially insidious when changing filters while on page 2+ of results

**Where to add this**: Immediately after the `usePaginatedTableState` hook call, before the client-side feature state.

**Example of the bug**:
1. User is on page 3 of "All Products" (showing items 21-30)
2. User clicks "Active" filter
3. Without reset: Table tries to show page 3 of active products using cursor from "All Products" page 3
4. Result: Wrong items displayed, pagination broken
5. With reset: Table correctly shows page 1 of active products

---

## Common Issues and Solutions

### Issue: "Column with id 'X.Y' does not exist"

**Cause**: Using nested `accessorKey` instead of `accessorFn`

**Solution**:
```typescript
// Change from:
{ accessorKey: 'customer.name' }

// To:
{ id: 'name', accessorFn: (row) => row.customer.name }
```

### Issue: Row Navigation Triggers on Button Clicks

**Cause**: Missing `stopPropagation()` on interactive elements

**Solution**:
```typescript
// Wrap interactive elements:
<div onClick={(e) => e.stopPropagation()}>
  <Button>...</Button>
</div>
```

### Issue: "No results" Shows During Loading

**Cause**: Wrong state checking order

**Solution**:
```typescript
// Check isLoading FIRST:
{isLoading ? (
  <LoadingState />
) : rows.length ? (
  <DataRows />
) : (
  <EmptyState />
)}
```

### Issue: Wrong Data After Filter Change

**Cause**: Missing filter reset effect - table keeps old pagination cursors when filters change

**Solution**:
```typescript
// Add this immediately after usePaginatedTableState hook
const filtersKey = JSON.stringify(filters)
React.useEffect(() => {
  goToFirstPage()
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [filtersKey])
```

**How to test**: Navigate to page 2+, then change a filter. Without the fix, you'll see wrong data. With the fix, table resets to page 1 correctly.

### Issue: Search Not Working

**⚠️ IMPORTANT**: Only the CUSTOMERS table has backend search support!

**If migrating customers table, check**:
1. Backend supports `searchQuery` parameter? ✅ (yes for customers)
2. `useSearchDebounce` hook imported?
3. `searchQuery` passed to `usePaginatedTableState`?
4. `CollapsibleSearch` component in toolbar?

**If migrating ANY OTHER table** (Products, Subscriptions, Payments, etc.), remove search-related code entirely (see "Tables WITHOUT Search" section). The backend doesn't support search for these tables.

---

## Testing Checklist

After migration, test these scenarios **on all pages where the table is used** (main listing page AND detail pages):

### Core Functionality (Test on Each Page)
- [ ] **🚨 CRITICAL: tableLayout: 'fixed'** - Inspect Table element in browser DevTools, verify it has `style="table-layout: fixed;"`
- [ ] **🚨 CRITICAL: className="w-full"** - Verify Table element has `className="w-full"` for proper fill behavior
- [ ] **Column widths respected** - Verify columns match their defined `size` values (not content-based)
- [ ] **Column sizing configuration** - Verify `enableColumnResizing: true`, `columnSizing` state, `onColumnSizingChange` handler
- [ ] **Header widths applied** - Verify each `<TableHead>` has `style={{ width: header.getSize() }}`
- [ ] **Column size definitions** - Verify all columns have appropriate `size`, `minSize`, `maxSize` values
- [ ] **Actions column fixed** - Verify actions column has `enableResizing: false` and doesn't grow
- [ ] **Space distribution** - Verify high-priority columns (names) get more space than constrained columns (IDs)
- [ ] **Table renders** - Table displays correctly with data
- [ ] **Column visibility** - Toggle columns via settings icon
- [ ] **Pagination** - Navigate pages, change page size
- [ ] **Row navigation** - Click rows (if applicable)
- [ ] **Action menu** - Click three dots, verify all actions work
- [ ] **Copyable cells** - Hover, click copy button
- [ ] **Create button** - Click create button in toolbar (if applicable)
- [ ] **Loading states** - Verify loading/fetching opacity
- [ ] **Empty state** - Verify "No results" when appropriate
- [ ] **Sorting** - Click headers (client-side sorting)

### Filters (Test on Each Page Where Filters Apply)
- [ ] **Filter buttons render** - All/Active/Inactive buttons appear
- [ ] **All filter** - Shows all entities
- [ ] **Active filter** - Shows only active entities
- [ ] **Inactive filter** - Shows only inactive entities
- [ ] **Filter persistence** - Selected filter stays active during pagination
- [ ] **Base filters work** - Detail page filters (e.g., pricingModelId) apply correctly
- [ ] **🚨 CRITICAL: Filter reset** - Changing filters while on page 2+ resets to page 1 (no stale cursor bug)

### Search (⚠️ ONLY FOR CUSTOMERS TABLE)
- [ ] **Search input** - Type in search, verify 1s debounce delay
- [ ] **Search results** - Verify correct results
- [ ] **Search loading** - Loading spinner appears during search
- [ ] **Clear search** - Clearing search restores all results

### Page-Specific Tests

#### Main Listing Pages
- [ ] **No base filter** - Table shows all entities for organization
- [ ] **Breadcrumb** - Navigation breadcrumb works
- [ ] **Page header** - Header displays without action button

#### Detail Pages
- [ ] **Base filter applied** - Only shows entities for parent (e.g., products for specific pricing model)
- [ ] **Create modal context** - Created entity associates with parent correctly
- [ ] **Multiple tables** - If page has multiple tables, all work correctly
- [ ] **Page layout** - Tables don't break responsive layout

---

## Success Criteria

✅ **Migration is successful when:**

1. **🚨 CRITICAL: tableLayout: 'fixed' applied** - Table element has `style={{ tableLayout: 'fixed' }}`
2. **🚨 CRITICAL: className="w-full" applied** - Table element has `className="w-full"`
3. **Column widths work correctly** - Columns respect their `size` values (not content-based)
4. **Complete column sizing setup:**
   - `enableColumnResizing: true` in useReactTable config
   - `columnResizeMode: 'onEnd'` for performance
   - `onColumnSizingChange: setColumnSizing` handler present
   - `columnSizing` included in table state
   - `ColumnSizingState` imported and state created
   - All columns have appropriate `size` values
   - Critical columns have `minSize` and `maxSize` defined
   - Actions column has `enableResizing: false`
   - `style={{ width: header.getSize() }}` applied to all TableHead elements
5. **No linter errors** in new files
4. **All existing functionality works** (search, filters, actions, modals)
5. **Create button moved** from page header to table toolbar
6. **Old table component deleted**
7. **All table usages updated**:
   - Main listing page updated
   - All detail pages updated (if applicable)
   - `TableHeader` components removed from all usages
   - Filter options added consistently across all pages
   - Create buttons integrated into table toolbar on all pages
6. **Follows Shadcn patterns**:
   - Uses `accessorFn` for nested data
   - Uses `row.getValue()` pattern
   - Uses `EnhancedDataTableActionsMenu`
   - Uses `DataTableCopyableCell`
   - Uses `CollapsibleSearch` (if search enabled)
   - Proper `stopPropagation()` on interactive elements
7. **User experience improved**:
   - Loading states show correctly
   - Search has loading spinner (customers only)
   - Filter buttons work consistently on all pages
   - Pagination auto-hides when ≤10 rows
   - Column visibility toggle works
8. **Code quality improved**:
   - Separation of concerns (columns, table, page)
   - Reusable hooks and components
   - Consistent patterns across tables
   - DRY filter logic using helper functions
9. **Consistency across pages**:
   - Same table component used everywhere
   - Same filter UI on main page and detail pages
   - Same create button pattern on all pages
   - Base filters properly combined with status filters

---

## Backend Changes Summary

**Changes Made**: ✅ **NONE**  
**Database Changes**: ✅ **NONE**  
**API Changes**: ✅ **NONE**  
**tRPC Endpoints**: ✅ **NONE**  

This is a **frontend-only refactor** that:
- Improves code organization and reusability
- Adopts Shadcn component patterns
- Enhances user experience with better loading states
- Maintains 100% existing functionality
- Requires no backend deployment or coordination

---

## Next Steps After Migration

1. **Update other tables** using this same pattern
2. **Consider backend improvements** (e.g., adding search to tables that don't have it)
3. **Add indexes** if search queries become slow (see `shadcn-data-table-gameplan.md`)
4. **Enhance components** as patterns emerge across multiple tables

---

## Using Git Commands to Access Reference Files

Since the `data-table-refactor` branch contains most refactored tables, here's how to access them:

### **Quick Reference Commands**

```bash
# List all files in a directory from the branch
git ls-tree -r --name-only origin/data-table-refactor:platform/flowglad-next/src/app/customers/

# View specific files
git show origin/data-table-refactor:platform/flowglad-next/src/app/customers/columns.tsx
git show origin/data-table-refactor:platform/flowglad-next/src/app/customers/data-table.tsx
git show origin/data-table-refactor:platform/flowglad-next/src/app/customers/Internal.tsx

# Save to a file for easier review
git show origin/data-table-refactor:platform/flowglad-next/src/app/customers/columns.tsx > reference.txt

# Compare with your current implementation
git show origin/data-table-refactor:platform/flowglad-next/src/app/customers/columns.tsx > ref.txt
diff src/app/customers/CustomersTable.tsx ref.txt
```

### **Common Tables and Their Paths**

```bash
# Customers
git show origin/data-table-refactor:platform/flowglad-next/src/app/customers/columns.tsx

# Products
git show origin/data-table-refactor:platform/flowglad-next/src/app/store/products/columns.tsx

# Subscriptions
git show origin/data-table-refactor:platform/flowglad-next/src/app/finance/subscriptions/columns.tsx

# Payments
git show origin/data-table-refactor:platform/flowglad-next/src/app/finance/payments/columns.tsx

# Invoices
git show origin/data-table-refactor:platform/flowglad-next/src/app/finance/invoices/columns.tsx

# Features
git show origin/data-table-refactor:platform/flowglad-next/src/app/features/columns.tsx

# Prices
git show origin/data-table-refactor:platform/flowglad-next/src/app/store/products/[id]/prices/columns.tsx

# Discounts
git show origin/data-table-refactor:platform/flowglad-next/src/app/store/discounts/columns.tsx

# Webhooks
git show origin/data-table-refactor:platform/flowglad-next/src/app/settings/webhooks/columns.tsx

# API Keys
git show origin/data-table-refactor:platform/flowglad-next/src/app/settings/api-keys/columns.tsx

# Usage Meters
git show origin/data-table-refactor:platform/flowglad-next/src/app/store/usage-meters/columns.tsx

# Pricing Models
git show origin/data-table-refactor:platform/flowglad-next/src/app/store/pricing-models/columns.tsx

# Organization Members
git show origin/data-table-refactor:platform/flowglad-next/src/app/settings/teammates/columns.tsx
```

### **What to Look For in Reference Files**

✅ **DO copy these patterns:**
- Column definitions structure
- Use of `accessorFn` for nested data
- `EnhancedDataTableActionsMenu` usage
- `DataTableCopyableCell` patterns
- Action menu item structures
- Cell formatting patterns
- Toolbar layout
- Pagination setup

⚠️ **DON'T copy these (backend-related):**
- Changes to tRPC endpoints
- Database query modifications
- New filter parameters that require backend changes
- Search functionality (except for customers table)
- Any imports from modified backend files

### **Verifying Frontend-Only Changes**

Before copying patterns from the reference branch, verify they're frontend-only:

```bash
# Check if the pattern requires backend changes
# Look for these in the reference implementation:

# ❌ BAD - Requires backend changes:
# - New filter fields not in your current backend
# - searchQuery on tables other than customers
# - New computed fields in table row data
# - Modified tRPC input schemas

# ✅ GOOD - Frontend-only changes:
# - Column structure and cell rendering
# - Action menu definitions
# - Toolbar layout
# - Pagination UI
# - Table state management
# - Navigation logic
```

---

## Related Documentation

- **This Guide**: `frontend-only-shadcn-table-migration.md` - Frontend-only migration (you are here)
- **Full Migration Guide**: `shadcn-data-table-gameplan.md` - Complete guide including backend changes
- **Reference Branch**: `data-table-refactor` - Contains refactored tables (git commands above)
- **Shadcn Data Table**: [https://ui.shadcn.com/docs/components/data-table](https://ui.shadcn.com/docs/components/data-table)
- **TanStack Table v8**: [https://tanstack.com/table/v8](https://tanstack.com/table/v8)

---

## Quick Start: Using the Reference Branch

**For experienced developers, here's the fastest approach:**

1. **Fetch the reference branch:**
   ```bash
   git fetch origin data-table-refactor
   ```

2. **View your table's refactored version:**
   ```bash
   git show origin/data-table-refactor:platform/flowglad-next/src/app/[your-path]/columns.tsx
   git show origin/data-table-refactor:platform/flowglad-next/src/app/[your-path]/data-table.tsx
   ```

3. **Copy the frontend patterns** while avoiding:
   - Backend changes (tRPC modifications)
   - Database changes (new searchable columns)
   - API changes (new filter schemas)
   - Search functionality (unless migrating customers)

4. **Verify against this guide's checklist** to ensure compliance.

**Note**: The reference branch is your best friend for this migration! Most of the work is already done there - you just need to cherry-pick the frontend parts.

---

## Revision History

- **v1.8** (Oct 2025) - **CRITICAL PATTERNS UPDATE**: Added mandatory patterns for customer links and detail page titles:
  - Added `DataTableLinkableCell` import requirement for customer columns
  - Added PATTERN 7: Customer name with link to customer detail page
  - Added `title` prop to data-table interface and all code templates
  - Updated toolbar structure to display title on detail pages
  - Added dedicated section "Tables With Customer Links" explaining the pattern
  - Updated "Pattern 3: Detail Pages" to always include title prop
  - Applied to all code examples (with search and without search)
  - These patterns are now used in Invoices, Payments, and Subscriptions tables
- **v1.7** (Oct 2025) - Added documentation for 3 additional tables found in codebase that weren't mentioned in original list: Subscription Items, Usage Events, and Purchases (customer detail page variant). These tables need manual migration as they don't have reference implementations in the `data-table-refactor` branch.
- **v1.6** (Oct 2025) - **COMPREHENSIVE COLUMN SIZING UPDATE**: Major update incorporating complete TanStack Table column sizing documentation. Changes:
  - Added "Column Sizing Properties Deep Dive" section explaining space distribution algorithm
  - Corrected `minSize` default from 50 to 20 (TanStack default)
  - Clarified `enableResizing` as VALID property (prevents user drag-to-resize)
  - Distinguished between responsive sizing (automatic) and interactive resizing (user drag)
  - Added strategic sizing recommendations by content type
  - Updated all code templates with accurate `size`/`minSize`/`maxSize` values and comments
  - Added `className="w-full"` to all Table elements for proper fill behavior
  - Added critical pattern: "Avoid Fixed CSS Widths in Cell Content"
  - Added critical pattern: "Use Block Elements for Truncation"
  - Enhanced testing checklist with column sizing verification steps
  - Enhanced success criteria with complete column sizing setup requirements
  - Added reference to comprehensive `docs/guides/table-sizing-guide.md`
- **v1.5** (Oct 2025) - **CRITICAL UPDATE**: Added mandatory filter reset pattern using `useEffect` with `goToFirstPage()` when filters change. This prevents cursor reuse bug where changing filters while on later pages fetches wrong data. Updated all code templates, added to critical patterns, testing checklist, and common issues. Fixed in pricing-models and products tables.
- **v1.4** (Oct 2025) - **CRITICAL UPDATE**: Added prominent section on `tableLayout: 'fixed'` requirement after discovering all 4 tables were missing this critical CSS property. Updated all code templates, testing checklist, and success criteria to emphasize this requirement. This prevents silent sizing failures where tables appear to work but column sizing is completely broken.
- **v1.3** (Oct 2025) - Added Step 6 for finding and updating all table usages including detail pages, expanded testing checklist and success criteria to include detail page testing, added usage pattern analysis to Step 2
- **v1.2** (Oct 2025) - Updated pagination pattern to use `goToFirstPage()` instead of `handlePaginationChange(0)` when page size changes to prevent stale cursor bugs
- **v1.1** (Oct 2025) - Added emphasis on `data-table-refactor` branch as reference, git commands for accessing files
- **v1.0** (Oct 2025) - Initial version based on customers table migration

