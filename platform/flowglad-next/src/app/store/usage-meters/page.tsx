import { authenticatedTransaction } from '@/db/databaseMethods'
import {
  selectUsageMeters,
  selectUsageMeterTableRows,
} from '@/db/tableMethods/usageMeterMethods'
import InternalUsageMetersPage from './InternalUsageMetersPage'

export default async function UsageMetersPage() {
  // Fetch usage meters for the organization
  const usageMeters = await authenticatedTransaction(
    async ({ transaction }) => {
      return selectUsageMeterTableRows({}, transaction)
    }
  )

  return (
    <div className="container mx-auto py-6">
      <InternalUsageMetersPage usageMeters={usageMeters} />
    </div>
  )
}
