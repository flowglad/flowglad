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
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={twMerge(
        clsx(
          'w-full caption-bottom table-fixed overflow-hidden rounded-radius bg-nav',
          className
        )
      )}
      style={{ borderCollapse: 'collapse' }}
      {...props}
    />
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

const PaginationRow = ({ table }: { table: TableType<any> }) => {
  return (
    <div className="flex items-center gap-2 w-full justify-between py-3">
      <div className="text-sm text-secondary">
        {table.getRowCount().toLocaleString()} Results
      </div>
      <div className="flex flex-row items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            onClick={() => table.firstPage()}
            disabled={!table.getCanPreviousPage()}
            variant="ghost"
            iconLeading={<ChevronLeft />}
            className="h-8 w-8 p-0"
          />
          <Button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            variant="ghost"
            iconLeading={<ArrowLeft />}
            className="h-8 w-8 p-0"
          />
          <Button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            variant="ghost"
            iconLeading={<ArrowRight />}
            className="h-8 w-8 p-0"
          />
          <Button
            onClick={() => table.lastPage()}
            disabled={!table.getCanNextPage()}
            variant="ghost"
            iconLeading={<ChevronRight />}
            className="h-8 w-8 p-0"
          />
        </div>
        <span className="flex items-center gap-1 text-sm text-secondary">
          <div>Page</div>
          <strong>
            {table.getState().pagination.pageIndex + 1} of{' '}
            {table.getPageCount().toLocaleString()}
          </strong>
        </span>
      </div>
      {/* <Select
        options={[10, 20, 30, 40, 50].map((pageSize) => ({
          label: pageSize.toString(),
          value: pageSize.toString(),
        }))}
        label="Show"
        value={table.getState().pagination.pageSize.toString()}
        onValueChange={(value) => {
          table.setPageSize(Number(value))
        }}
      /> */}
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
  onClickRow?: (row: TData) => void
  className?: string
}

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
    },
  })
  const rowLength = data.length
  if (rowLength === 0) {
    return (
      <div className="w-full border-dashed border-2 border-stroke-subtle rounded-radius flex items-center justify-center h-32 my-4">
        <span className="text-secondary">No items.</span>
      </div>
    )
  }
  return (
    <div
      className={clsx(
        'w-full',
        bordered &&
          'border border-stroke overflow-hidden rounded-radius',
        className
      )}
    >
      <TableRoot className={clsx('w-full', 'table-fixed')}>
        {caption && <TableCaption>{caption}</TableCaption>}
        {columns.some((column) => !!column.header) && (
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow className="border-none" key={headerGroup.id}>
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
        {rowLength > 10 && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={columns.length}>
                <PaginationRow table={table} />
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
        {footer && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={columns.length}>{footer}</TableCell>
            </TableRow>
          </TableFooter>
        )}
      </TableRoot>
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
