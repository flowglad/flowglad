'use client'

import { useState } from 'react'
import InternalPageContainer from '@/components/InternalPageContainer'
import ApiKeysTable from './ApiKeysTable'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import PageTitle from '@/components/ion/PageTitle'
import { Plus } from 'lucide-react'
import CreateApiKeyModal from '@/components/forms/CreateApiKeyModal'
import { Button } from '@/components/ui/button'
import { FlowgladApiKeyType } from '@/types'

function ApiKeysPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <div className="flex flex-row justify-between">
          <PageTitle className="mb-6">API Keys</PageTitle>
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus size={16} />
            Create API Key
          </Button>
        </div>
        <ApiKeysTable
          filters={{
            type: FlowgladApiKeyType.Secret,
          }}
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
