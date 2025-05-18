import { selectUsageMeterById } from '@/db/tableMethods/usageMeterMethods'
import { Payment } from '@/db/schema/payments'
import { DbTransaction } from '@/db/types'
import { UsageMeter } from '@/db/schema/usageMeters'
import { safelyFinalizeUsageCreditForSucceededPayment } from '@/db/tableMethods/usageCreditMethods'
import { createPaymentConfirmationLedgerEntries } from './usageLedgerHelpers'
import { UsageCreditType } from '@/types'

export const ingestAndProcessSucceededPaymentForUsageMeter = async (
  payment: Payment.Record,
  usageMeter: UsageMeter.Record,
  transaction: DbTransaction
) => {
  await safelyFinalizeUsageCreditForSucceededPayment(
    payment,
    usageMeter,
    transaction
  )
  await createPaymentConfirmationLedgerEntries(
    {
      payment,
      usageMeter,
    },
    transaction
  )
}
