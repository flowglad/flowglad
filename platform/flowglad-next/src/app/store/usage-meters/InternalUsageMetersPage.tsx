'use client'
import { PageHeader } from '@/components/ion/PageHeader'
import { UsageMeter } from '@/db/schema/usageMeters'
import UsageMetersTable from './UsageMetersTable'
import InternalPageContainer from '@/components/InternalPageContainer'

export default function UsageMetersPage({
  usageMeters,
}: {
  usageMeters: UsageMeter.TableRow[]
}) {
  return (
    <InternalPageContainer>
      <PageHeader
        title="Usage Meters"
        tabs={[
          {
            label: 'Usage Meters',
            subPath: '/usage-meters',
            Component: () => <UsageMetersTable data={usageMeters} />,
          },
        ]}
        hideTabs={true}
      />
    </InternalPageContainer>
  )
}
