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
export type ApiKeysTableProps =
  | { data: ApiKey.ClientRecord[]; loading: false }
  | { data: undefined; loading: true }

const ApiKeysTable = ({ data, loading }: ApiKeysTableProps) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const { livemode } = useAuthContext()
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
              {cellData.name}
            </span>
          ),
        },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell title="Token" column={column} />
          ),
          accessorKey: 'token',
          cell: ({ row: { original: cellData } }) => {
            return <ApiKeyTokenCell apiKey={cellData} />
          },
        },
        // {
        //   header: ({ column }) => (
        //     <SortableColumnHeaderCell
        //       title="Last Used"
        //       column={column}
        //     />
        //   ),
        //   accessorKey: 'lastUsed',
        //   cell: ({ row: { original: cellData } }) => (
        //     <span className="text-sm">{cellData.lastUsed ? core.formatDate(cellData.lastUsed) : 'Never'}</span>
        //   ),
        // },
        {
          header: ({ column }) => (
            <SortableColumnHeaderCell
              title="Created"
              column={column}
            />
          ),
          accessorKey: 'createdAt',
          cell: ({ row: { original: cellData } }) => (
            <>{core.formatDate(cellData.createdAt!)}</>
          ),
        },
        {
          header: () => <div />,
          id: 'actions',
          cell: ({ row: { original: cellData } }) => (
            <MoreMenuCell apiKey={cellData} />
          ),
        },
      ] as DisplayColumnDef<ApiKey.ClientRecord>[],
    []
  )
  /**
   * In testmode, the user shouldn't be able to create API keys
   */
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
            <FallbackSkeleton
              showSkeleton={loading}
              className="h-16 w-full"
            >
              <Table
                columns={columns}
                data={data ?? []}
                className="bg-nav"
                bordered
              />
            </FallbackSkeleton>
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
