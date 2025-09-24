'use client'

import { useState } from 'react'
import InternalPageContainer from '@/components/InternalPageContainer'
import { ApiKeysDataTable } from './data-table'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import { PageHeader } from '@/components/ui/page-header'
import CreateApiKeyModal from '@/components/forms/CreateApiKeyModal'
import { FlowgladApiKeyType } from '@/types'

function ApiKeysPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <PageHeader title="API Keys" />
        <div>
          <ApiKeysDataTable
            filters={{
              type: FlowgladApiKeyType.Secret,
            }}
            onCreateApiKey={() => setIsCreateModalOpen(true)}
          />
        </div>
        <CreateApiKeyModal
          isOpen={isCreateModalOpen}
          setIsOpen={setIsCreateModalOpen}
        />
      </div>
    </InternalPageContainer>
  )
}

export default ApiKeysPage
