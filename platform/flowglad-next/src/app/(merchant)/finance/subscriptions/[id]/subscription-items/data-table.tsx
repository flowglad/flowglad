'use client'

import type { CurrencyCode } from '@db-core/enums'
import type { SubscriptionItem } from '@db-core/schema/subscriptionItems'
import {
  type ColumnFiltersState,
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import type { ReactNode } from 'react'
import * as React from 'react'
import { DataTableViewOptions } from '@/components/ui/data-table-view-options'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { columns } from './columns'

interface SubscriptionItemsDataTableProps {
  subscriptionItems: SubscriptionItem.ClientRecord[]
  currencyCode: CurrencyCode
  title?: string
  toolbarContent?: ReactNode
}

export function SubscriptionItemsDataTable({
  subscriptionItems,
  currencyCode,
  title,
  toolbarContent,
}: SubscriptionItemsDataTableProps) {
  // Client-side features (Shadcn patterns)
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [columnSizing, setColumnSizing] =
    React.useState<ColumnSizingState>({})

  const table = useReactTable({
    data: subscriptionItems,
    columns: columns(currencyCode),
    enableColumnResizing: true,
    columnResizeMode: 'onEnd',
    defaultColumn: {
      size: 150,
      minSize: 20,
      maxSize: 500,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnSizing,
    },
  })

  return (
    <div className="w-full">
      {/* Enhanced toolbar */}
      <div className="flex items-center justify-between pt-4 pb-3 gap-4 min-w-0">
        {/* Title on the left (for detail pages) */}
        <div className="flex items-center gap-4 min-w-0 flex-shrink overflow-hidden">
          {title && <h3 className="text-lg truncate">{title}</h3>}
        </div>

        {/* Controls on the right */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {toolbarContent}
          <DataTableViewOptions table={table} />
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
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
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
                colSpan={columns(currencyCode).length}
                className="h-24 text-center text-muted-foreground"
              >
                No subscription items.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
