import { useMemo, useState } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import Table from '@/components/ion/Table'
import SortableColumnHeaderCell from '@/components/ion/SortableColumnHeaderCell'
import {
  Customer,
  InferredCustomerStatus,
  CustomerTableRowData,
} from '@/db/schema/customers'
import core from '@/utils/core'
import Badge, { BadgeColor } from '@/components/ion/Badge'
import { sentenceCase } from 'change-case'
import TableRowPopoverMenu from '@/components/TableRowPopoverMenu'
import { trpc } from '@/app/_trpc/client'
import { useRouter } from 'next/navigation'
import { Price } from '@/db/schema/prices'
import { Product } from '@/db/schema/products'
import { CurrencyCode } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'

const customerStatusColors: Record<
  InferredCustomerStatus,
  BadgeColor
> = {
  [InferredCustomerStatus.Active]: 'green',
  [InferredCustomerStatus.Archived]: 'red',
  [InferredCustomerStatus.Pending]: 'yellow',
  [InferredCustomerStatus.Concluded]: 'grey',
  [InferredCustomerStatus.PastDue]: 'red',
}

const CustomerStatusCell = ({
  status,
}: {
  status: InferredCustomerStatus
}) => {
  return (
    <Badge color={customerStatusColors[status]}>
      {sentenceCase(status)}
    </Badge>
  )
}

const CustomerMoreMenuCell = ({
  customer,
  prices,
}: {
  customer: Customer.ClientRecord
  prices: {
    price: Price.Record
    product: Product.ClientRecord
  }[]
}) => {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isArchiveCustomerOpen, setIsArchiveCustomerOpen] =
    useState(false)
  const [isCreateInvoiceOpen, setIsCreateInvoiceOpen] =
    useState(false)

  const basePopoverMenuItems = [
    {
      label: 'Edit Customer',
      handler: () => setIsEditOpen(true),
    },
    {
      label: 'Archive Customer',
      state: 'danger',
      handler: () => setIsArchiveCustomerOpen(true),
    },
  ]

  const maybeNewInvoiceItem = [
    {
      label: 'New Invoice',
      handler: () => setIsCreateInvoiceOpen(true),
    },
  ]

  return (
    <>
      <TableRowPopoverMenu
        items={[...maybeNewInvoiceItem, ...basePopoverMenuItems]}
      />
    </>
  )
}

export interface CustomersTableFilters {
  archived?: boolean
  organizationId?: string
}

const CustomersTable = ({
  filters = {},
}: {
  filters?: CustomersTableFilters
}) => {
  const router = useRouter()
  const [pageIndex, setPageIndex] = useState(0)
  const pageSize = 10

  const { data, isLoading, isFetching } =
    trpc.customers.getTableRows.useQuery({
      cursor: pageIndex.toString(),
      limit: pageSize,
      filters,
    })

  const columns = useMemo(
    () =>
      [
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell title="Name" column={column} />
          ),
          accessorKey: 'customer.name',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.customer.name}</span>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell title="Email" column={column} />
          ),
          accessorKey: 'customer.email',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.customer.email}</span>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Total Spend"
              column={column}
            />
          ),
          accessorKey: 'totalSpend',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                CurrencyCode.USD,
                cellData.totalSpend || 0
              )}
            </span>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Payments"
              column={column}
            />
          ),
          accessorKey: 'payments',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">{cellData.payments || 0}</span>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Created At"
              column={column}
            />
          ),
          accessorKey: 'customer.createdAt',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm">
              {core.formatDate(cellData.customer.createdAt!)}
            </span>
          ),
        },
        {
          id: '_',
          cell: ({ row: { original: cellData } }) => (
            <div className="flex justify-end w-full">
              <CustomerMoreMenuCell
                customer={cellData.customer}
                prices={[]}
              />
            </div>
          ),
        },
      ] as ColumnDef<CustomerTableRowData>[],
    []
  )

  const handlePaginationChange = (newPageIndex: number) => {
    setPageIndex(newPageIndex)
  }

  const tableData = data?.data || []
  const total = data?.total || 0
  const pageCount = Math.ceil(total / pageSize)

  return (
    <Table
      columns={columns}
      data={tableData}
      className="bg-nav"
      bordered
      pagination={{
        pageIndex,
        pageSize,
        total,
        onPageChange: handlePaginationChange,
        isLoading,
        isFetching,
      }}
      onClickRow={(row) => {
        router.push(`/customers/${row.customer.id}`)
      }}
    />
  )
}

export default CustomersTable
