import * as React from 'react'
import {
  ChartColumnIncreasing,
  Plus,
  Pencil,
  Copy,
  Archive,
  ArchiveRestore,
  Star,
  Trash2,
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { RotateCw, Check } from 'lucide-react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Price } from '@/db/schema/prices'
import core from '@/utils/core'
import CreatePriceModal from '@/components/forms/CreatePriceModal'
import EditPriceModal from '@/components/forms/EditPriceModal'
import ArchivePriceModal from '@/components/forms/ArchivePriceModal'
import SetPriceAsDefaultModal from '@/components/forms/SetPriceAsDefaultModal'
import PricingCellView from '@/components/PricingCellView'
import { PriceType } from '@/types'
import { TableHeader as TableHeaderComponent } from '@/components/ui/table-header'
import { trpc } from '@/app/_trpc/client'
import {
  EnhancedDataTableActionsMenu,
  ActionMenuItem,
} from '@/components/ui/enhanced-data-table-actions-menu'
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import { DataTablePagination } from '@/components/ui/data-table-pagination'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { Product } from '@/db/schema/products'
import StatusBadge from '@/components/StatusBadge'

const PriceActionsMenu = ({
  price,
  otherPrices,
}: {
  price: Price.ClientRecord
  otherPrices: Price.ClientRecord[]
}) => {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isArchiveOpen, setIsArchiveOpen] = useState(false)
  const [isSetDefaultOpen, setIsSetDefaultOpen] = useState(false)
  const copyTextHandler = useCopyTextHandler({
    text: `${process.env.NEXT_PUBLIC_APP_URL}/price/${price.id}/purchase`,
  })

  const items: ActionMenuItem[] = [
    {
      label: 'Edit price',
      icon: <Pencil className="h-4 w-4" />,
      handler: () => setIsEditOpen(true),
    },
    {
      label: 'Copy purchase link',
      icon: <Copy className="h-4 w-4" />,
      handler: copyTextHandler,
    },
  ]

  /**
   * Case 1: Price is archived - show unarchive option
   * Case 2: Price is not default AND it's active - show make default option
   */
  if (!price.active) {
    items.push({
      label: 'Unarchive price',
      icon: <ArchiveRestore className="h-4 w-4" />,
      handler: () => setIsArchiveOpen(true),
    })
  }
  if (!price.isDefault && otherPrices.some((p) => p.isDefault)) {
    items.push({
      label: 'Make default',
      icon: <Star className="h-4 w-4" />,
      handler: () => setIsSetDefaultOpen(true),
    })
  }

  const canDelist = !price.isDefault && otherPrices.length > 0
  /**
   * Only show archive option if price is active,
   * but only have it enabled if there are other prices
   */
  if (price.active) {
    let helperText: string | undefined = undefined
    if (price.isDefault) {
      helperText = 'Make another price default to archive this.'
    } else if (otherPrices.length === 0) {
      helperText =
        'Every product must have at least one active price.'
    }
    items.push({
      label: 'Archive price',
      icon: <Archive className="h-4 w-4" />,
      handler: () => setIsArchiveOpen(true),
      disabled: !canDelist,
      helperText,
    })
  }
  items.push({
    label: 'Delete price',
    icon: <Trash2 className="h-4 w-4" />,
    destructive: true,
    disabled: !canDelist,
    handler: () => {
      // TODO: Implement delete price functionality
    },
  })

  return (
    <EnhancedDataTableActionsMenu items={items}>
      <EditPriceModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        price={price}
      />
      <ArchivePriceModal
        isOpen={isArchiveOpen}
        setIsOpen={setIsArchiveOpen}
        price={price}
      />
      <SetPriceAsDefaultModal
        isOpen={isSetDefaultOpen}
        setIsOpen={setIsSetDefaultOpen}
        price={price}
      />
    </EnhancedDataTableActionsMenu>
  )
}

const PriceTypeCellView = ({ type }: { type: PriceType }) => {
  switch (type) {
    case PriceType.Subscription:
      return (
        <div className="flex items-center gap-3">
          <RotateCw size={16} strokeWidth={2} />
          <div className="w-fit flex flex-col justify-center text-sm font-normal text-foreground">
            Subscription
          </div>
        </div>
      )
    case PriceType.SinglePayment:
      return (
        <div className="flex items-center gap-3">
          <div className="w-fit flex flex-col justify-center text-sm font-normal text-foreground">
            Single Payment
          </div>
        </div>
      )
    case PriceType.Usage:
      return (
        <div className="flex items-center gap-3">
          <ChartColumnIncreasing size={16} strokeWidth={2} />
          <div className="w-fit flex flex-col justify-center text-sm font-normal text-foreground">
            Usage
          </div>
        </div>
      )
    default:
      return null
  }
}

export interface PaginatedPricesTableFilters {
  productId?: string
  type?: PriceType
  isDefault?: boolean
}

const PaginatedPricesTable = ({
  filters = {},
  productId,
}: {
  productId: string
  filters?: PaginatedPricesTableFilters
}) => {
  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    {
      price: Price.ClientRecord
      product: Pick<Product.ClientRecord, 'id' | 'name'>
    },
    PaginatedPricesTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: 10,
    filters: {
      ...filters,
      productId,
    },
    useQuery: trpc.prices.getTableRows.useQuery,
  })

  const columns = useMemo(
    () =>
      [
        {
          id: 'name',
          accessorFn: (row) => row.price.name,
          header: 'Price',
          cell: ({ row }) => (
            <div className="font-medium">{row.getValue('name')}</div>
          ),
        },
        {
          id: 'type',
          accessorFn: (row) => row.price.type,
          header: 'Type',
          cell: ({ row }) => {
            const type = row.getValue('type') as PriceType
            return <PriceTypeCellView type={type} />
          },
        },
        {
          id: 'pricing',
          accessorFn: (row) => row.price,
          header: 'Pricing',
          minSize: 105,
          maxSize: 120,
          cell: ({ row }) => {
            const price = row.getValue(
              'pricing'
            ) as Price.ClientRecord
            return (
              <div className="min-w-[105px] max-w-[120px]">
                <PricingCellView prices={[price]} />
              </div>
            )
          },
        },
        {
          id: 'active',
          accessorFn: (row) => row.price.active,
          header: 'Status',
          size: 110,
          cell: ({ row }) => {
            const active = row.getValue('active') as boolean
            return <StatusBadge active={active} />
          },
        },
        {
          id: 'isDefault',
          accessorFn: (row) => row.price.isDefault,
          header: 'Default',
          cell: ({ row }) => {
            const isDefault = row.getValue('isDefault') as boolean
            return (
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={isDefault}
                  aria-label="Select row"
                  className="cursor-default"
                />
              </div>
            )
          },
        },
        {
          id: 'createdAt',
          accessorFn: (row) => row.price.createdAt,
          header: 'Created',
          cell: ({ row }) => {
            const date = row.getValue('createdAt') as Date
            return <div>{core.formatDate(date)}</div>
          },
        },
        {
          id: 'id',
          accessorFn: (row) => row.price.id,
          header: 'ID',
          cell: ({ row }) => {
            const id = row.getValue('id') as string
            return (
              <DataTableCopyableCell copyText={id}>
                {id}
              </DataTableCopyableCell>
            )
          },
        },
        {
          id: 'actions',
          enableHiding: false,
          size: 40,
          cell: ({ row }) => {
            const price = row.original.price
            const otherPrices =
              data?.items
                .filter((p) => p.price.id !== price.id)
                .map((p) => p.price) || []

            return (
              <div onClick={(e) => e.stopPropagation()}>
                <PriceActionsMenu
                  price={price}
                  otherPrices={otherPrices}
                />
              </div>
            )
          },
        },
      ] as ColumnDef<{
        price: Price.ClientRecord
        product: { id: string; name: string }
      }>[],
    [data]
  )

  const table = useReactTable({
    data: data?.items || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: Math.ceil((data?.total || 0) / pageSize),
    state: {
      pagination: { pageIndex, pageSize },
    },
  })

  return (
    <div className="w-full flex flex-col gap-5 pb-8">
      <div className="w-full flex flex-col gap-2">
        <div className="w-full flex flex-col gap-2">
          <div className="w-full flex flex-col gap-5">
            {/* Table */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
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
                        className={isFetching ? 'opacity-50' : ''}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            style={{ width: cell.column.getSize() }}
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
                        className="h-24 text-center text-muted-foreground"
                      >
                        No results.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="py-2">
              <DataTablePagination
                table={table}
                totalCount={data?.total}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PaginatedPricesTable
