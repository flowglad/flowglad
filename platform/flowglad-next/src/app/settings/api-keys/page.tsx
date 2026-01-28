'use client'

import { Info } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import CreateApiKeyModal from '@/components/forms/CreateApiKeyModal'
import PageContainer from '@/components/PageContainer'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
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
        <Alert variant="secondary" className="mb-4">
          <Info className="h-4 w-4" />
          <div>
            <AlertTitle>
              API Keys are now Pricing Model scoped
            </AlertTitle>
            <AlertDescription>
              All API keys are now restricted to a single pricing
              model. If you have multiple pricing models, you'll need
              separate API keys for each.
            </AlertDescription>
          </div>
        </Alert>
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
