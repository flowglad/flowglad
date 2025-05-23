import { z } from 'zod'
import { Event } from '@/db/schema/events'
// TODO: Import other relevant Drizzle schema insert types as they become sources for ledger entries
// For example:
// import { payments } from '@/db/schema/payments';
// import { refunds } from '@/db/schema/refunds';
// import { invoices } from '@/db/schema/invoices';
// import { subscriptionMeterPeriodCalculations } from '@/db/schema/subscriptionMeterPeriodCalculations';

// Import Zod SELECT schemas from table definition files
import { usageCreditsSelectSchema } from '@/db/schema/usageCredits'
import { usageCreditApplicationsSelectSchema } from '@/db/schema/usageCreditApplications'
import { usageCreditBalanceAdjustmentsSelectSchema } from '@/db/schema/usageCreditBalanceAdjustments'
import { paymentsSelectSchema } from '@/db/schema/payments'
import { invoicesSelectSchema } from '@/db/schema/invoices'
import { subscriptionMeterPeriodCalculationSelectSchema } from '@/db/schema/subscriptionMeterPeriodCalculations'
// TODO: Import other relevant Zod SELECT schemas as they become sources for ledger entries
import { refundsSelectSchema } from '@/db/schema/refunds'

// Define the union of all record types that can back ledger entries
// These should typically be the Drizzle Zod `Insert` types for the respective tables

// Zod schema for validating backing records (now using select schemas)
export const ledgerBackingRecordsSchema = z.object({
  usageCredits: usageCreditsSelectSchema.array().optional(),
  usageCreditApplications: usageCreditApplicationsSelectSchema
    .array()
    .optional(),
  usageCreditBalanceAdjustments:
    usageCreditBalanceAdjustmentsSelectSchema.array().optional(),
  payments: paymentsSelectSchema.array().optional(),
  invoices: invoicesSelectSchema.array().optional(),
  subscriptionMeterPeriodCalculations:
    subscriptionMeterPeriodCalculationSelectSchema.array().optional(),
  refunds: refundsSelectSchema.array().optional(),
  // TODO: Add other Zod select schemas here
  // usageEvents: usageEventsSelectSchema.array().optional(),
})

// Inferred TypeScript type from the Zod schema
export type LedgerBackingRecord = z.infer<
  typeof ledgerBackingRecordsSchema
>

// Command to instruct the ledger processing unit
export interface LedgerCommand {
  transactionDetails: {
    // Optional: For the LedgerTransaction (UsageTransactions record) itself
    initiatingSourceType?: string
    initiatingSourceId?: string
    subscriptionId: string
    description?: string
    organizationId: string // Added to ensure LedgerTransaction gets an org ID if needed for admin flows
    metadata?: Record<string, unknown> // For UsageTransactions.metadata
  }
  // The actual records already created/updated in the current DB transaction that need ledgering
  backingRecords: LedgerBackingRecord
}

// Unified output structure for functions running within our transactions
export interface TransactionOutput<T> {
  result: T
  eventsToLog?: Event.Insert[]
  ledgerCommand?: LedgerCommand
}
