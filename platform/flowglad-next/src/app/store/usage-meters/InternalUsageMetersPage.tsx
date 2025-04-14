'use client'
import { PageHeader } from '@/components/ion/PageHeader'
import UsageMetersTable, {
  UsageMetersTableFilters,
} from './UsageMetersTable'
import InternalPageContainer from '@/components/InternalPageContainer'
import CreateUsageMeterModal from '@/components/components/CreateUsageMeterModal'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import Button from '@/components/ion/Button'

export default function UsageMetersPage() {
  const [createUsageMeterModalOpen, setCreateUsageMeterModalOpen] =
    useState(false)
  const [filters, setFilters] = useState<UsageMetersTableFilters>({})

  return (
    <InternalPageContainer>
      <PageHeader
        title="Usage Meters"
        tabs={[
          {
            label: 'Usage Meters',
            subPath: '/usage-meters',
            Component: () => <UsageMetersTable filters={filters} />,
          },
        ]}
        primaryButton={
          <Button
            onClick={() => setCreateUsageMeterModalOpen(true)}
            iconLeading={<Plus size={16} strokeWidth={2} />}
          >
            Create Usage Meter
          </Button>
        }
        hideTabs={true}
      />
      <CreateUsageMeterModal
        isOpen={createUsageMeterModalOpen}
        setIsOpen={setCreateUsageMeterModalOpen}
      />
    </InternalPageContainer>
  )
}
