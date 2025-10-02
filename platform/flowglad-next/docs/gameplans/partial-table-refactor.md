# Partial Table Refactor Guide: Frontend-Only Shadcn Migration

## Executive Summary

This guide provides step-by-step instructions for migrating tables to Shadcn best practices **without making any backend, database, or API changes**. This is a frontend-only refactor that improves code quality, reusability, and user experience while preserving all existing functionality.

**Based on**: Successful customers table migration (completed Oct 2025)  
**Reference Branch**: `data-table-refactor` (contains refactored tables, but includes unwanted backend changes)  
**Use Case**: Refactor tables that already have working backend search/pagination  
**Time Estimate**: 30-60 minutes per table  
**Risk Level**: Low (frontend-only changes)

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

```markdown
## Current Implementation Analysis

**Table Location**: `src/app/[path]/[TableName]Table.tsx`
**Page Component**: `src/app/[path]/Internal.tsx` or `page.tsx`
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
    minSize: 140,
  },
  
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
  
  // PATTERN 7: Actions column (always last)
  {
    id: 'actions',
    enableHiding: false,
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
    size: 50,
    maxSize: 50,
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
  onCreateEntity?: () => void
}

export function YourDataTable({
  filters = {},
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
    enableColumnResizing: true,
    columnResizeMode: 'onEnd',
    defaultColumn: {
      size: 150,
      minSize: 50,
      maxSize: 500,
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
        handlePaginationChange(0)
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
      <div className="flex items-center py-4">
        <div className="flex items-center gap-2 ml-auto">
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
      <Table>
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

### Step 6: Delete Old Table Component

Once the new implementation is tested:

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
<div className="flex items-center py-4">
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

  // Client-side features (Shadcn patterns)
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({})

  const table = useReactTable({
    data: data?.items || [],
    columns,
    enableColumnResizing: true,
    columnResizeMode: 'onEnd',
    defaultColumn: {
      size: 150,
      minSize: 50,
      maxSize: 500,
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
        handlePaginationChange(0)
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
      <div className="flex items-center py-4">
        <div className="flex items-center gap-2 ml-auto">
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
      <Table>
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

After migration, test these scenarios:

- [ ] **Search** - ⚠️ ONLY FOR CUSTOMERS TABLE - Type in search, verify 1s debounce delay
- [ ] **Column visibility** - Toggle columns via settings icon
- [ ] **Pagination** - Navigate pages, change page size
- [ ] **Row navigation** - Click rows (if applicable)
- [ ] **Action menu** - Click three dots, verify all actions work
- [ ] **Copyable cells** - Hover, click copy button
- [ ] **Create button** - Click create button in toolbar
- [ ] **Loading states** - Verify loading/fetching opacity
- [ ] **Empty state** - Clear search, verify "No results"
- [ ] **Column resizing** - Drag column borders (if enabled)
- [ ] **Sorting** - Click headers (client-side sorting)
- [ ] **Filters** - Test all filter combinations

---

## Success Criteria

✅ **Migration is successful when:**

1. **No linter errors** in new files
2. **All existing functionality works** (search, filters, actions, modals)
3. **Create button moved** from page header to table toolbar
4. **Old table component deleted**
5. **Follows Shadcn patterns**:
   - Uses `accessorFn` for nested data
   - Uses `row.getValue()` pattern
   - Uses `EnhancedDataTableActionsMenu`
   - Uses `DataTableCopyableCell`
   - Uses `CollapsibleSearch` (if search enabled)
   - Proper `stopPropagation()` on interactive elements
6. **User experience improved**:
   - Loading states show correctly
   - Search has loading spinner
   - Pagination auto-hides when ≤10 rows
   - Column visibility toggle works
7. **Code quality improved**:
   - Separation of concerns (columns, table, page)
   - Reusable hooks and components
   - Consistent patterns across tables

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

- **Full Migration Guide**: `shadcn-data-table-gameplan.md` (for tables needing backend changes)
- **Reference Branch**: `data-table-refactor` (git commands above)
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

- **v1.1** (Oct 2025) - Added emphasis on `data-table-refactor` branch as reference, git commands for accessing files
- **v1.0** (Oct 2025) - Initial version based on customers table migration

