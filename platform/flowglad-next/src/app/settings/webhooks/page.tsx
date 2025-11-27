'use client'

import { useState } from 'react'
import CreateWebhookModal from '@/components/forms/CreateWebhookModal'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import { PageHeader } from '@/components/ui/page-header'
import { WebhooksDataTable } from './data-table'

function WebhooksPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <PageHeader title="Webhooks" className="mb-6" />

        <WebhooksDataTable
          onCreateWebhook={() => setIsCreateModalOpen(true)}
        />
        <CreateWebhookModal
          isOpen={isCreateModalOpen}
          setIsOpen={setIsCreateModalOpen}
        />
      </div>
    </InternalPageContainer>
  )
}

export default WebhooksPage
