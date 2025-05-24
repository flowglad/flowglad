import { LedgerCommand } from './ledgerManagerTypes'
import { Event } from './schema/events'

// Unified output structure for functions running within our transactions
export interface TransactionOutput<T> {
  result: T
  eventsToLog?: Event.Insert[]
  ledgerCommand?: LedgerCommand
}
