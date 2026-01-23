'use client'

import type { ColumnDef } from '@tanstack/react-table'
// Icons come next
import { Eye, Pencil } from 'lucide-react'
import * as React from 'react'
import { trpc } from '@/app/_trpc/client'
import EditWebhookModal from '@/components/forms/EditWebhookModal'
// UI components last
import { DataTableCopyableCell } from '@/components/ui/data-table-copyable-cell'
import {
  type ActionMenuItem,
  EnhancedDataTableActionsMenu,
} from '@/components/ui/enhanced-data-table-actions-menu'
import {
  ActiveStatusTag,
  booleanToActiveStatus,
} from '@/components/ui/status-tag'
// Other imports
import type { Webhook } from '@/db/schema/webhooks'
import WebhookSecretModal from './WebhookSecretModal'

export type WebhookTableRowData = {
  webhook: Webhook.ClientRecord
}

function WebhookActionsMenu({
  webhook,
}: {
  webhook: Webhook.ClientRecord
}) {
  const [isSecretModalOpen, setIsSecretModalOpen] =
    React.useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false)
  const [webhookSecret, setWebhookSecret] = React.useState<string>('')

  const requestSecret = trpc.webhooks.requestSigningSecret.useQuery(
    {
      webhookId: webhook.id,
    },
    {
      enabled: false,
    }
  )

  const handleShowSecret = async () => {
    const result = await requestSecret.refetch()
    setWebhookSecret(result.data?.secret || '')
    setIsSecretModalOpen(true)
  }

  const actionItems: ActionMenuItem[] = [
    {
      label: 'Show Signing Secret',
      icon: <Eye className="h-4 w-4" />,
      handler: handleShowSecret,
    },
    {
      label: 'Edit Webhook',
      icon: <Pencil className="h-4 w-4" />,
      handler: () => setIsEditModalOpen(true),
    },
  ]

  return (
    <EnhancedDataTableActionsMenu items={actionItems}>
      <WebhookSecretModal
        secret={webhookSecret}
        isOpen={isSecretModalOpen}
        setIsOpen={setIsSecretModalOpen}
      />
      <EditWebhookModal
        isOpen={isEditModalOpen}
        setIsOpen={setIsEditModalOpen}
        webhook={webhook}
      />
    </EnhancedDataTableActionsMenu>
  )
}

export const columns: ColumnDef<WebhookTableRowData>[] = [
  {
    id: 'name',
    accessorFn: (row) => row.webhook.name,
    header: 'Name',
    cell: ({ row }) => (
      <div className="truncate" title={row.getValue('name')}>
        {row.getValue('name')}
      </div>
    ),
    size: 112,
    minSize: 90,
    maxSize: 150,
  },
  {
    id: 'url',
    accessorFn: (row) => row.webhook.url,
    header: 'URL',
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <DataTableCopyableCell copyText={row.getValue('url')}>
          {row.getValue('url')}
        </DataTableCopyableCell>
      </div>
    ),
    size: 150,
    minSize: 125,
    maxSize: 200,
  },
  {
    id: 'active',
    accessorFn: (row) => row.webhook.active,
    header: 'Status',
    cell: ({ row }) => (
      <ActiveStatusTag
        status={booleanToActiveStatus(row.getValue('active'))}
        showTooltip
        tooltipVariant="muted"
      />
    ),
    size: 110,
    minSize: 105,
    maxSize: 115,
  },
  {
    id: 'webhookId',
    accessorFn: (row) => row.webhook.id,
    header: 'ID',
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()}>
        <DataTableCopyableCell copyText={row.getValue('webhookId')}>
          {row.getValue('webhookId')}
        </DataTableCopyableCell>
      </div>
    ),
    size: 180,
    minSize: 125,
    maxSize: 250,
  },
  {
    id: 'actions',
    enableHiding: false,
    enableResizing: false,
    cell: ({ row }) => {
      const webhook = row.original.webhook
      return (
        <div
          className="w-8 flex justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <WebhookActionsMenu webhook={webhook} />
        </div>
      )
    },
    size: 1,
    minSize: 56,
    maxSize: 56,
  },
]
