'use client'

import { useState } from 'react'
import InternalPageContainer from '@/components/InternalPageContainer'
import { WebhooksDataTable } from './data-table'
import { PageHeader } from '@/components/ui/page-header'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import CreateWebhookModal from '@/components/forms/CreateWebhookModal'

function WebhooksPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <PageHeader title="Webhooks" />
        <div>
          <WebhooksDataTable
            onCreateWebhook={() => setIsCreateModalOpen(true)}
          />
        </div>
        <CreateWebhookModal
          isOpen={isCreateModalOpen}
          setIsOpen={setIsCreateModalOpen}
        />
      </div>
    </InternalPageContainer>
  )
}

export default WebhooksPage
