'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import CreateApiKeyModal from '@/components/forms/CreateApiKeyModal'
import PageContainer from '@/components/PageContainer'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { FlowgladApiKeyType } from '@/types'
import { ApiKeysDataTable } from './data-table'

function ApiKeysPage() {
  const router = useRouter()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  return (
    <PageContainer>
      <div className="w-full relative flex flex-col justify-center pb-6">
        <PageHeaderNew
          title="API Keys"
          breadcrumb="Settings"
          onBreadcrumbClick={() => router.push('/settings')}
          className="pb-4"
          hideBorder
          actions={[
            {
              label: 'Create API Key',
              onClick: () => setIsCreateModalOpen(true),
            },
          ]}
        />
        <div className="w-full flex flex-col">
          <ApiKeysDataTable
            filters={{
              type: FlowgladApiKeyType.Secret,
            }}
          />
        </div>
      </div>
      <CreateApiKeyModal
        isOpen={isCreateModalOpen}
        setIsOpen={setIsCreateModalOpen}
      />
    </PageContainer>
  )
}

export default ApiKeysPage
