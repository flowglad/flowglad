'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import CreateWebhookModal from '@/components/forms/CreateWebhookModal'
import PageContainer from '@/components/PageContainer'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { WebhooksDataTable } from './data-table'

function WebhooksPage() {
  const router = useRouter()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  return (
    <PageContainer>
      <div className="w-full relative flex flex-col justify-center pb-6">
        <PageHeaderNew
          title="Webhooks"
          breadcrumb="Settings"
          onBreadcrumbClick={() => router.push('/settings')}
          className="pb-4"
          hideBorder
          actions={[
            {
              label: 'Create Webhook',
              onClick: () => setIsCreateModalOpen(true),
            },
          ]}
        />
        <div className="w-full flex flex-col">
          <WebhooksDataTable />
        </div>
      </div>
      <CreateWebhookModal
        isOpen={isCreateModalOpen}
        setIsOpen={setIsCreateModalOpen}
      />
    </PageContainer>
  )
}

export default WebhooksPage
