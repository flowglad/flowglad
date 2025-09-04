'use client'

import { useState } from 'react'
import InternalPageContainer from '@/components/InternalPageContainer'
import WebhooksTable from './WebhooksTable'
import { PageHeader } from '@/components/ui/page-header'
import { MigrationButton as Button } from '@/components/ui/button-migration'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import CreateWebhookModal from '@/components/forms/CreateWebhookModal'
import { Plus } from 'lucide-react'

function WebhooksPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <PageHeader
          title="Webhooks"
          className="mb-6"
          action={
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              iconLeading={<Plus size={16} />}
            >
              Create Webhook
            </Button>
          }
        />

        <WebhooksTable />
        <CreateWebhookModal
          isOpen={isCreateModalOpen}
          setIsOpen={setIsCreateModalOpen}
        />
      </div>
    </InternalPageContainer>
  )
}

export default WebhooksPage
