'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import CreateApiKeyModal from '@/components/forms/CreateApiKeyModal'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { FlowgladApiKeyType } from '@/types'
import { ApiKeysDataTable } from './data-table'

function ApiKeysPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <PageHeader
          title="API Keys"
          className="mb-6"
          action={
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create API Key
            </Button>
          }
        />
        <ApiKeysDataTable
          filters={{
            type: FlowgladApiKeyType.Secret,
          }}
          onCreateApiKey={() => setIsCreateModalOpen(true)}
        />
        <CreateApiKeyModal
          isOpen={isCreateModalOpen}
          setIsOpen={setIsCreateModalOpen}
        />
      </div>
    </InternalPageContainer>
  )
}

export default ApiKeysPage
