'use client'

import * as React from 'react'
import {
  ColumnDef,
  ColumnFiltersState,
  ColumnSizingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  VisibilityState,
} from '@tanstack/react-table'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TablePagination } from '@/components/ui/table-pagination'
import { cn } from '@/lib/utils'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  onClickRow?: (row: TData) => void
  className?: string
  bordered?: boolean
  pagination?: {
    pageIndex: number
    pageSize: number
    total: number
    onPageChange: (page: number) => void
    isLoading?: boolean
    isFetching?: boolean
  }
}

export function DataTable<TData, TValue>({
  columns,
  data,
  onClickRow,
  className,
  bordered = true,
  pagination,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [columnSizing, setColumnSizing] =
    React.useState<ColumnSizingState>({})
  const [rowSelection, setRowSelection] = React.useState({})

  const table = useReactTable({
    data,
    columns,
    enableColumnResizing: true,
    columnResizeMode: 'onEnd',
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    manualPagination: !!pagination,
    pageCount: pagination
      ? Math.ceil(pagination.total / pagination.pageSize)
      : -1,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnSizing,
      rowSelection,
      ...(pagination && {
        pagination: {
          pageIndex: pagination.pageIndex,
          pageSize: pagination.pageSize,
        },
      }),
    },
  })

  return (
    <div className={cn('flex flex-col', className)}>
      <div
        className={cn(
          'rounded-xl overflow-hidden',
          'w-full',
          // Responsive horizontal scroll with proper shadows
          'overflow-x-auto scrollbar-hidden',
          // Minimum width to prevent cramping
          'min-w-0',
          bordered && 'border'
        )}
      >
        <div className="w-full">
          <Table
            className="table-fixed w-full"
            style={{
              tableLayout: 'fixed',
              width: '100%',
            }}
          >
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead
                        key={header.id}
                        style={{
                          width:
                            header.column.columnDef.header ===
                              'Date' ||
                            header.column.columnDef.header ===
                              'Purchase Date'
                              ? '125px !important'
                              : header.column.columnDef.header ===
                                  'ID'
                                ? '125px !important'
                                : header.getSize(),
                          maxWidth:
                            header.column.columnDef.header ===
                              'Date' ||
                            header.column.columnDef.header ===
                              'Purchase Date'
                              ? '125px !important'
                              : header.column.columnDef.header ===
                                  'ID'
                                ? '250px !important'
                                : header.getSize(),
                          minWidth:
                            header.column.columnDef.header ===
                              'Date' ||
                            header.column.columnDef.header ===
                              'Purchase Date'
                              ? '125px !important'
                              : header.column.columnDef.header ===
                                  'ID'
                                ? '125px !important'
                                : header.getSize(),
                          boxSizing:
                            header.column.columnDef.header ===
                              'Date' ||
                            header.column.columnDef.header ===
                              'Purchase Date' ||
                            header.column.columnDef.header === 'ID'
                              ? 'border-box'
                              : undefined,
                          flex:
                            header.column.columnDef.header ===
                              'Date' ||
                            header.column.columnDef.header ===
                              'Purchase Date' ||
                            header.column.columnDef.header === 'ID'
                              ? 'none !important'
                              : undefined,
                        }}
                        className={
                          header.column.columnDef.header === 'Date' ||
                          header.column.columnDef.header ===
                            'Purchase Date'
                            ? 'overflow-hidden !w-[125px] !max-w-[125px] !min-w-[125px]'
                            : header.column.columnDef.header === 'ID'
                              ? 'overflow-hidden !w-[125px] !max-w-[250px] !min-w-[125px]'
                              : undefined
                        }
                        {...((header.column.columnDef.header ===
                          'Date' ||
                          header.column.columnDef.header ===
                            'Purchase Date' ||
                          header.column.columnDef.header ===
                            'ID') && {
                          'data-debug': `id:${header.id}, size:${header.getSize()}`,
                        })}
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
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className={
                      onClickRow ? 'cursor-pointer' : undefined
                    }
                    onClick={() =>
                      onClickRow && onClickRow(row.original)
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        style={{
                          width:
                            cell.column.columnDef.header === 'Date' ||
                            cell.column.columnDef.header ===
                              'Purchase Date'
                              ? '125px !important'
                              : cell.column.columnDef.header === 'ID'
                                ? '125px !important'
                                : cell.column.getSize(),
                          maxWidth:
                            cell.column.columnDef.header === 'Date' ||
                            cell.column.columnDef.header ===
                              'Purchase Date'
                              ? '125px !important'
                              : cell.column.columnDef.header === 'ID'
                                ? '250px !important'
                                : cell.column.getSize(),
                          minWidth:
                            cell.column.columnDef.header === 'Date' ||
                            cell.column.columnDef.header ===
                              'Purchase Date'
                              ? '125px !important'
                              : cell.column.columnDef.header === 'ID'
                                ? '125px !important'
                                : cell.column.getSize(),
                          boxSizing:
                            cell.column.columnDef.header === 'Date' ||
                            cell.column.columnDef.header ===
                              'Purchase Date' ||
                            cell.column.columnDef.header === 'ID'
                              ? 'border-box'
                              : undefined,
                          flex:
                            cell.column.columnDef.header === 'Date' ||
                            cell.column.columnDef.header ===
                              'Purchase Date' ||
                            cell.column.columnDef.header === 'ID'
                              ? 'none !important'
                              : undefined,
                        }}
                        className={
                          cell.column.columnDef.header === 'Date' ||
                          cell.column.columnDef.header ===
                            'Purchase Date'
                            ? 'overflow-hidden whitespace-nowrap text-ellipsis !w-[125px] !max-w-[125px] !min-w-[125px]'
                            : cell.column.columnDef.header === 'ID'
                              ? 'overflow-hidden whitespace-nowrap text-ellipsis !w-[125px] !max-w-[250px] !min-w-[125px]'
                              : undefined
                        }
                      >
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
                    className="h-24 text-center"
                  >
                    {pagination?.isLoading || pagination?.isFetching
                      ? 'Loading...'
                      : 'No results.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      {pagination && (
        <TablePagination
          pageIndex={pagination.pageIndex}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onPageChange={pagination.onPageChange}
          isLoading={pagination.isLoading}
          isFetching={pagination.isFetching}
        />
      )}
    </div>
  )
}
