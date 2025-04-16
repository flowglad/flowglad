// ion/TableContainer: Generated with Ion on 9/20/2024, 10:31:46 PM
import {
  type ColumnDef,
  type SortingState,
  type Table as TableType,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import clsx from 'clsx'
import * as React from 'react'
import { useState } from 'react'
import { twMerge } from 'tailwind-merge'
import Button from './Button'
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'

/* ---------------------------------- Component --------------------------------- */

const TableRoot = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full">
    <div className="overflow-auto">
      <table
        ref={ref}
        className={twMerge(
          clsx(
            'w-full caption-bottom table-fixed rounded-radius bg-nav',
            className
          )
        )}
        style={{ borderCollapse: 'collapse' }}
        {...props}
      />
    </div>
  </div>
))
TableRoot.displayName = 'Table'

/* ---------------------------------- Component --------------------------------- */

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={className} {...props} />
))
TableHeader.displayName = 'TableHeader'

/* ---------------------------------- Component --------------------------------- */

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={className} {...props} />
))
TableBody.displayName = 'TableBody'

/* ---------------------------------- Component --------------------------------- */

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={twMerge(
      clsx('border-t border-stroke-subtle font-medium', className)
    )}
    {...props}
  />
))
TableFooter.displayName = 'TableFooter'

/* ---------------------------------- Component --------------------------------- */

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement> & {
    borderless?: boolean
  }
>(({ className, borderless, ...props }, ref) => (
  <tr
    ref={ref}
    className={twMerge(
      clsx(
        'border-stroke-subtle border-t transition-colors last:border-b-0 data-[state=selected]:bg-container-high ',
        borderless && 'border-none',
        className
      )
    )}
    {...props}
  />
))
TableRow.displayName = 'TableRow'

/* ---------------------------------- Component --------------------------------- */

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & { rounded?: boolean }
>(({ className, style, rounded, ...props }, ref) => (
  <th
    ref={ref}
    className={twMerge(
      clsx(
        'px-5 py-3 text-left align-middle text-sm font-normal text-secondary bg-fbg-white-0 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        rounded && 'first:rounded-tl-radius last:rounded-tr-radius',
        className
      )
    )}
    style={{
      ...style,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      // maxWidth: '0',
    }}
    {...props}
  />
))
TableHead.displayName = 'TableHead'

/* ---------------------------------- Component --------------------------------- */

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, style, ...props }, ref) => (
  <td
    ref={ref}
    className={twMerge(
      clsx(
        'px-5 py-3 align-middle text-sm text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className
      )
    )}
    style={{
      ...style,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      // maxWidth: '0',
    }}
    {...props}
  />
))
TableCell.displayName = 'TableCell'

/* ---------------------------------- Component --------------------------------- */

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={clsx('py-1 text-sm text-secondary', className)}
    {...props}
  />
))
TableCaption.displayName = 'TableCaption'

const PaginationRow = ({
  table,
  isLoading,
  isFetching,
}: {
  table: TableType<any>
  isLoading?: boolean
  isFetching?: boolean
}) => {
  const pagination = table.getState().pagination
  const total =
    (table.options.meta as { total?: number })?.total ??
    table.getRowCount()
  const showingStart =
    total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1
  const showingEnd = Math.min(
    showingStart + pagination.pageSize - 1,
    total
  )

  // Show skeleton when total isn't ready yet (initial load)
  if (isLoading && total === 0) {
    return (
      <div className="flex items-center gap-2 w-full justify-between py-3">
        <div className="text-sm text-secondary">
          <div className="h-4 w-24 bg-stroke-subtle animate-pulse rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 w-full justify-between py-3">
      <div className="text-sm text-secondary">
        {total === 0 ? (
          'No Results'
        ) : total === 1 ? (
          '1 Result'
        ) : (
          <>{total.toLocaleString()} Results</>
        )}
      </div>
      {total > 10 && (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => table.setPageIndex(0)}
            disabled={
              !table.getCanPreviousPage() || isLoading || isFetching
            }
            size="sm"
            className="p-0 h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
            <ChevronLeft className="h-4 w-4 -ml-3" />
          </Button>
          <Button
            variant="ghost"
            onClick={() => table.previousPage()}
            disabled={
              !table.getCanPreviousPage() || isLoading || isFetching
            }
            size="sm"
            className="p-0 h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            onClick={() => table.nextPage()}
            disabled={
              !table.getCanNextPage() || isLoading || isFetching
            }
            size="sm"
            className="p-0 h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              table.setPageIndex(table.getPageCount() - 1)
            }
            disabled={
              !table.getCanNextPage() || isLoading || isFetching
            }
            size="sm"
            className="p-0 h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" />
            <ChevronRight className="h-4 w-4 -ml-3" />
          </Button>
        </div>
      )}
    </div>
  )
}

/* ---------------------------------- Type --------------------------------- */

export type ColumnDefWithWidth<TData, TValue> = ColumnDef<
  TData,
  TValue
> & {
  width?: number | string // Can be pixel value or percentage
  minWidth?: number
  maxWidth?: number
}

export interface PaginationProps {
  pageIndex: number
  pageSize: number
  total: number
  onPageChange: (pageIndex: number) => void
  isLoading?: boolean
  isFetching?: boolean
}

export interface TableProps<TData, TValue> {
  /** Table columns */
  columns: ColumnDefWithWidth<TData, TValue>[]
  /** Table data */
  data: TData[]
  /** Table footer */
  footer?: React.ReactNode
  /** Table caption */
  caption?: React.ReactNode
  /** Adds a border around the table
   * @default false
   */
  bordered?: boolean
  /** Removes the border from the rows
   * @default false
   */
  borderlessRows?: boolean
  /** Loading state of the table
   * @default false
   */
  isLoading?: boolean
  onClickRow?: (row: TData) => void
  className?: string
  /** Pagination props */
  pagination?: PaginationProps
}

const LoadingRow = ({
  columns,
}: {
  columns: ColumnDefWithWidth<any, any>[]
}) => (
  <TableRow className="animate-pulse border-none">
    <TableCell colSpan={columns.length}>
      <div className="h-8 bg-stroke-subtle rounded w-full" />
    </TableCell>
  </TableRow>
)

/* ---------------------------------- Component --------------------------------- */
function Table<TData, TValue>({
  bordered = false,
  columns,
  data,
  footer,
  caption,
  className,
  onClickRow,
  borderlessRows = false,
  pagination,
  isLoading = false,
}: TableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState({})

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      rowSelection,
      pagination: pagination
        ? {
            pageIndex: pagination.pageIndex,
            pageSize: pagination.pageSize,
          }
        : undefined,
    },
    manualPagination: !!pagination,
    pageCount: pagination
      ? Math.ceil(pagination.total / pagination.pageSize)
      : undefined,
    onPaginationChange: pagination
      ? (updater) => {
          if (typeof updater === 'function') {
            const newState = updater({
              pageIndex: pagination.pageIndex,
              pageSize: pagination.pageSize,
            })
            pagination.onPageChange(newState.pageIndex)
          } else {
            pagination.onPageChange(updater.pageIndex)
          }
        }
      : undefined,
    meta: pagination ? { total: pagination.total } : undefined,
  })
  const rowLength = data.length

  if (isLoading || pagination?.isLoading || pagination?.isFetching) {
    return (
      <div
        className={clsx(
          'w-full',
          bordered &&
            'border border-stroke rounded-radius overflow-hidden',
          className
        )}
      >
        <div className="overflow-auto">
          <TableRoot className={clsx('w-full', 'table-fixed')}>
            {caption && <TableCaption>{caption}</TableCaption>}
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow
                  className="border-none"
                  key={headerGroup.id}
                >
                  {headerGroup.headers.map((header) => {
                    const columnDef = header.column
                      .columnDef as ColumnDef<TData, TValue> & {
                      width?: number | string
                      minWidth?: number
                      maxWidth?: number
                    }

                    return (
                      <TableHead
                        key={header.id}
                        colSpan={header.colSpan}
                        rounded={!bordered}
                        style={{
                          width: columnDef.width,
                          minWidth: columnDef.minWidth,
                          maxWidth: columnDef.maxWidth,
                        }}
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
              {Array.from({ length: 5 }).map((_, i) => (
                <LoadingRow key={i} columns={columns} />
              ))}
            </TableBody>
          </TableRoot>
        </div>
      </div>
    )
  }

  if (!isLoading && rowLength === 0) {
    return (
      <div className="w-full border-dashed border-2 border-stroke-subtle rounded-radius flex items-center justify-center h-32 my-4">
        <span className="text-secondary">No items.</span>
      </div>
    )
  }

  return (
    <div className="w-full flex flex-col gap-0">
      <div
        className={clsx(
          'w-full',
          bordered &&
            'border border-stroke rounded-radius overflow-hidden',
          className
        )}
      >
        <div className="overflow-auto">
          <TableRoot className={clsx('w-full', 'table-fixed')}>
            {caption && <TableCaption>{caption}</TableCaption>}
            {columns.some((column) => !!column.header) && (
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow
                    className="border-none"
                    key={headerGroup.id}
                  >
                    {headerGroup.headers.map((header) => {
                      const columnDef = header.column
                        .columnDef as ColumnDef<TData, TValue> & {
                        width?: number | string
                        minWidth?: number
                        maxWidth?: number
                      }

                      return (
                        <TableHead
                          key={header.id}
                          colSpan={header.colSpan}
                          rounded={!bordered}
                          style={{
                            width: columnDef.width,
                            minWidth: columnDef.minWidth,
                            maxWidth: columnDef.maxWidth,
                          }}
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
            )}
            <TableBody>
              {rowLength ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className={clsx(
                      'hover:bg-list-item-background-hover first:border-t-0',
                      row.getIsSelected() && 'bg-container-high',
                      onClickRow && 'cursor-pointer'
                    )}
                    onClick={
                      onClickRow
                        ? () => onClickRow(row.original)
                        : undefined
                    }
                    borderless={borderlessRows}
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
                    className="text-center"
                  >
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {footer && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={columns.length}>
                    {footer}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </TableRoot>
        </div>
      </div>
      {(rowLength > 10 || pagination) && (
        <div className="w-full px-4 pt-4">
          <PaginationRow
            table={table}
            isLoading={pagination?.isLoading}
            isFetching={pagination?.isFetching}
          />
        </div>
      )}
    </div>
  )
}

Table.displayName = 'Table'

export default Table

export {
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
}
