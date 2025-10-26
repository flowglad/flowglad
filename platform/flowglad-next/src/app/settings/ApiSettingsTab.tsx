'use client'
import { useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { ApiKeysDataTable } from '@/app/settings/api-keys/data-table'
import CreateApiKeyModal from '@/components/forms/CreateApiKeyModal'
import { WebhooksDataTable } from '@/app/settings/webhooks/data-table'
import CreateWebhookModal from '@/components/forms/CreateWebhookModal'
import { FlowgladApiKeyType } from '@/types'

const ApiSettingsTab = () => {
  const [isCreateApiKeyModalOpen, setIsCreateApiKeyModalOpen] =
    useState(false)
  const [isCreateWebhookModalOpen, setIsCreateWebhookModalOpen] =
    useState(false)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <ApiKeysDataTable
          title="API Keys"
          filters={{
            type: FlowgladApiKeyType.Secret,
          }}
          onCreateApiKey={() => setIsCreateApiKeyModalOpen(true)}
          buttonVariant="outline"
        />
        <CreateApiKeyModal
          isOpen={isCreateApiKeyModalOpen}
          setIsOpen={setIsCreateApiKeyModalOpen}
        />
      </div>
      <div className="flex flex-col gap-4">
        <WebhooksDataTable
          title="Webhooks"
          onCreateWebhook={() => setIsCreateWebhookModalOpen(true)}
          buttonVariant="outline"
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
