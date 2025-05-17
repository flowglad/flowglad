/* testDatabaseEnums script with targeted environment
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/testDatabaseEnums.ts
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { testDatabaseEnums } from '@/db/testEnums'
import { testEnumColumn } from '@/db/tableUtils'
import { usageCredits } from '@/db/schema/usageCredits'
import { UsageCreditType, UsageCreditStatus } from '@/types'
import { refunds } from '@/db/schema/refunds'
import { usageLedgerItems } from '@/db/schema/usageLedgerItems'
import {
  RefundStatus,
  UsageLedgerItemStatus,
  UsageLedgerItemDirection,
} from '@/types'

export async function testDatabaseEnumsFn(db: PostgresJsDatabase) {
  // eslint-disable-next-line no-console
  console.log('Testing database enum columns...')

  // Create a transaction
  await db.transaction(async (tx) => {
    await testDatabaseEnums(tx)

    // UsageCredits table
    await testEnumColumn(
      usageCredits,
      usageCredits.creditType,
      UsageCreditType,
      tx
    )
    await testEnumColumn(
      usageCredits,
      usageCredits.status,
      UsageCreditStatus,
      tx
    )

    // Refunds table
    await testEnumColumn(refunds, refunds.status, RefundStatus, tx)

    // UsageLedgerItems table
    await testEnumColumn(
      usageLedgerItems,
      usageLedgerItems.status,
      UsageLedgerItemStatus,
      tx
    )
    await testEnumColumn(
      usageLedgerItems,
      usageLedgerItems.direction,
      UsageLedgerItemDirection,
      tx
    )

    // eslint-disable-next-line no-console
    console.log('All enum columns tested successfully!')
  })
}

runScript(testDatabaseEnumsFn)
