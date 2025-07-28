'use client'
import { useState } from 'react'
import { PlusIcon } from 'lucide-react'
import ApiKeysTable from '@/app/settings/api-keys/ApiKeysTable'
import CreateApiKeyModal from '@/components/forms/CreateApiKeyModal'
import WebhooksTable from '@/app/settings/webhooks/WebhooksTable'
import CreateWebhookModal from '@/components/forms/CreateWebhookModal'
import TableTitle from '@/components/ion/TableTitle'
import { FlowgladApiKeyType } from '@/types'

const ApiSettingsTab = () => {
  const [isCreateApiKeyModalOpen, setIsCreateApiKeyModalOpen] =
    useState(false)
  const [isCreateWebhookModalOpen, setIsCreateWebhookModalOpen] =
    useState(false)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <TableTitle
          title="API Keys"
          buttonLabel="Create API Key"
          buttonIcon={<PlusIcon size={16} />}
          buttonOnClick={() => setIsCreateApiKeyModalOpen(true)}
        />
        <ApiKeysTable filters={{
          type: FlowgladApiKeyType.Secret,
        }} />
        <CreateApiKeyModal
          isOpen={isCreateApiKeyModalOpen}
          setIsOpen={setIsCreateApiKeyModalOpen}
        />
      </div>
      <div className="flex flex-col gap-4">
        <TableTitle
          title="Webhooks"
          buttonLabel="Create Webhook"
          buttonIcon={<PlusIcon size={16} />}
          buttonOnClick={() => setIsCreateWebhookModalOpen(true)}
        />
        <WebhooksTable />
        <CreateWebhookModal
          isOpen={isCreateWebhookModalOpen}
          setIsOpen={setIsCreateWebhookModalOpen}
        />
      </div>
    </div>
  )
}

export default ApiSettingsTab
