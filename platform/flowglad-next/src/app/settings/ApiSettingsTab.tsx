'use client'
import { useState } from 'react'
import { ApiKeysDataTable } from '@/app/settings/api-keys/data-table'
import CreateApiKeyModal from '@/components/forms/CreateApiKeyModal'
import { WebhooksDataTable } from '@/app/settings/webhooks/data-table'
import CreateWebhookModal from '@/components/forms/CreateWebhookModal'
import { TableHeader } from '@/components/ui/table-header'
import { FlowgladApiKeyType } from '@/types'

const ApiSettingsTab = () => {
  const [isCreateApiKeyModalOpen, setIsCreateApiKeyModalOpen] =
    useState(false)
  const [isCreateWebhookModalOpen, setIsCreateWebhookModalOpen] =
    useState(false)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <TableHeader title="API Keys" noButtons />
        <ApiKeysDataTable
          filters={{
            type: FlowgladApiKeyType.Secret,
          }}
          onCreateApiKey={() => setIsCreateApiKeyModalOpen(true)}
        />
        <CreateApiKeyModal
          isOpen={isCreateApiKeyModalOpen}
          setIsOpen={setIsCreateApiKeyModalOpen}
        />
      </div>
      <div className="flex flex-col gap-4">
        <TableHeader title="Webhooks" noButtons />
        <WebhooksDataTable
          onCreateWebhook={() => setIsCreateWebhookModalOpen(true)}
        />
        <CreateWebhookModal
          isOpen={isCreateWebhookModalOpen}
          setIsOpen={setIsCreateWebhookModalOpen}
        />
      </div>
    </div>
  )
}

export default ApiSettingsTab
