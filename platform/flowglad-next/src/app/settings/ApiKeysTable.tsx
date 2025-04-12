import { useMemo, useState } from 'react'
import { DisplayColumnDef } from '@tanstack/react-table'
import Table from '@/components/ion/Table'
import SortableColumnHeaderCell from '@/components/ion/SortableColumnHeaderCell'
import { ApiKey } from '@/db/schema/apiKeys'
import core from '@/utils/core'
import TableTitle from '@/components/ion/TableTitle'
import CreateApiKeyModal from '@/components/forms/CreateApiKeyModal'
import { Plus } from 'lucide-react'
import { FallbackSkeleton } from '@/components/ion/Skeleton'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import TableRowPopoverMenu from '@/components/TableRowPopoverMenu'
import { PopoverMenuItem } from '@/components/PopoverMenu'
import { FlowgladApiKeyType } from '@/types'
import { useAuthContext } from '@/contexts/authContext'
import { trpc } from '@/app/_trpc/client'

const MoreMenuCell = ({
  apiKey,
}: {
  apiKey: ApiKey.ClientRecord
}) => {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const basePopoverMenuItems: PopoverMenuItem[] = [
    // {
    //   label: 'New Purchase',
    //   handler: () => setIsNewPurchaseOpen(true),
    // },
  ]
  const isKeyDeleteable =
    apiKey.livemode && apiKey.type === FlowgladApiKeyType.Secret
  if (isKeyDeleteable) {
    basePopoverMenuItems.push({
      label: 'Delete API Key',
      handler: () => setIsDeleteOpen(true),
    })
  }
  return (
    <>
      <TableRowPopoverMenu items={[...basePopoverMenuItems]} />
    </>
  )
}

const ApiKeyTokenCell = ({
  apiKey,
}: {
  apiKey: ApiKey.ClientRecord
}) => {
  const copyTextHandler = useCopyTextHandler({
    text: apiKey.token,
  })
  if (apiKey.livemode) {
    return <span className="text-sm">{apiKey.token}</span>
  }
  return (
    <span
      className="text-sm cursor-pointer"
      onClick={copyTextHandler}
    >
      {apiKey.token}
    </span>
  )
}

export interface ApiKeysTableFilters {
  type?: FlowgladApiKeyType
  organizationId?: string
}

const ApiKeysTable = ({
  filters = {},
}: {
  filters?: ApiKeysTableFilters
}) => {
  const [pageIndex, setPageIndex] = useState(0)
  const pageSize = 10
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const { livemode } = useAuthContext()

  const { data, isLoading, isFetching } =
    trpc.apiKeys.getTableRows.useQuery({
      cursor: pageIndex.toString(),
      limit: pageSize,
      filters,
    })

  const columns = useMemo(
    () =>
      [
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Name"
              column={column}
              className="w-24"
            />
          ),
          id: 'name',
          cell: ({ row: { original: cellData } }) => (
            <span className="text-sm w-24 truncate">
              {cellData.apiKey.name}
            </span>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell title="Token" column={column} />
          ),
          accessorKey: 'token',
          cell: ({ row: { original: cellData } }) => {
            return <ApiKeyTokenCell apiKey={cellData.apiKey} />
          },
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Created"
              column={column}
            />
          ),
          accessorKey: 'createdAt',
          cell: ({ row: { original: cellData } }) => (
            <>{core.formatDate(cellData.apiKey.createdAt!)}</>
          ),
        },
        {
          header: () => <div />,
          id: 'actions',
          cell: ({ row: { original: cellData } }) => (
            <MoreMenuCell apiKey={cellData.apiKey} />
          ),
        },
      ] as DisplayColumnDef<{
        apiKey: ApiKey.ClientRecord
        organization: { id: string; name: string }
      }>[],
    []
  )

  const handlePaginationChange = (newPageIndex: number) => {
    setPageIndex(newPageIndex)
  }

  const tableData = data?.data || []
  const total = data?.total || 0
  const pageCount = Math.ceil(total / pageSize)

  return (
    <div className="w-full flex flex-col gap-5 pb-8">
      <TableTitle
        title="API Keys"
        buttonIcon={<Plus size={16} strokeWidth={2} />}
        buttonLabel="Create API Key"
        buttonOnClick={() => {
          setIsCreateModalOpen(true)
        }}
      />
      <div className="w-full flex flex-col gap-2">
        <div className="w-full flex flex-col gap-2">
          <div className="w-full flex flex-col gap-5">
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
            />
          </div>
        </div>
      </div>
      <CreateApiKeyModal
        isOpen={isCreateModalOpen}
        setIsOpen={setIsCreateModalOpen}
      />
    </div>
  )
}

export default ApiKeysTable
