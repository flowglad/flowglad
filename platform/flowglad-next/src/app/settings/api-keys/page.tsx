'use client'

import { useState } from 'react'
import InternalPageContainer from '@/components/InternalPageContainer'
import ApiKeysTable from './ApiKeysTable'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import { PageHeader } from '@/components/ui/page-header'
import { Plus } from 'lucide-react'
import CreateApiKeyModal from '@/components/forms/CreateApiKeyModal'
import { MigrationButton as Button } from '@/components/ui/button-migration'
import { FlowgladApiKeyType } from '@/types'

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
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              iconLeading={<Plus size={16} />}
            >
              Create API Key
            </Button>
          }
        />
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
