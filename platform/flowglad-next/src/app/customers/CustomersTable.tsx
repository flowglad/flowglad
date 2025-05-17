import { ChangeEvent, useEffect, useMemo, useState } from 'react'
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
import { trpc } from '@/app/_trpc/client'
import { useRouter } from 'next/navigation'
import { CurrencyCode } from '@/types'
import Input from '@/components/ion/Input'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import EditCustomerModal from '@/components/forms/EditCustomerModal'
import MoreMenuTableCell from '@/components/MoreMenuTableCell'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { useCopyTextHandler } from '../hooks/useCopyTextHandler'
import { usePaginatedTableState } from '@/app/hooks/usePaginatedTableState'
import { SearchIcon } from 'lucide-react'
import debounce from 'debounce'

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
}: {
  customer: Customer.ClientRecord
}) => {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const billingPortalURL = core.billingPortalPageURL({
    organizationId: customer.organizationId,
    customerExternalId: customer.externalId,
    page: 'manage',
  })
  const copyPortalURLHandler = useCopyTextHandler({
    text: billingPortalURL,
  })
  const copyIDHandler = useCopyTextHandler({
    text: customer.id,
  })
  const copyExternalIDHandler = useCopyTextHandler({
    text: customer.externalId,
  })
  const basePopoverMenuItems = [
    {
      label: 'Edit Customer',
      handler: () => setIsEditOpen(true),
    },
    {
      label: 'Copy Portal Link',
      handler: copyPortalURLHandler,
    },
    {
      label: 'Copy External ID',
      handler: copyExternalIDHandler,
    },
    {
      label: 'Copy ID',
      handler: copyIDHandler,
    },
  ]

  return (
    <MoreMenuTableCell items={basePopoverMenuItems}>
      <EditCustomerModal
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        customer={customer}
      />
    </MoreMenuTableCell>
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
  const [innerSearch, setInnerSearch] = useState('')
  const [search, setSearch] = useState('')
  const debouncedSetSearch = debounce(setSearch, 500)

  useEffect(() => {
    debouncedSetSearch(innerSearch)
  }, [innerSearch])

  const {
    pageIndex,
    pageSize,
    handlePaginationChange,
    data,
    isLoading,
    isFetching,
  } = usePaginatedTableState<
    CustomerTableRowData,
    CustomersTableFilters
  >({
    initialCurrentCursor: undefined,
    pageSize: 10,
    filters,
    searchQuery: search,
    useQuery: trpc.customers.getTableRows.useQuery,
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
          header: ({ column }) => (
            <SortableColumnHeaderCell title="ID" column={column} />
          ),
          accessorKey: 'customer.id',
          cell: ({ row: { original: cellData } }) => (
            <CopyableTextTableCell copyText={cellData.customer.id}>
              {cellData.customer.id}
            </CopyableTextTableCell>
          ),
        },
        {
          id: '_',
          cell: ({ row: { original: cellData } }) => (
            <CustomerMoreMenuCell customer={cellData.customer} />
          ),
        },
      ] as ColumnDef<CustomerTableRowData>[],
    []
  )

  const tableData = data?.items || []
  const total = data?.total || 0
  return (
    <>
      <Input
        value={innerSearch}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          setInnerSearch(e.target.value)
        }
        placeholder="Search"
        className="mb-4"
      />
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
    </>
  )
}

export default CustomersTable
