import type { LedgerCommand } from './ledgerManager/ledgerManagerTypes'
import type { Event } from './schema/events'

// Unified output structure for functions running within our transactions
export interface TransactionOutput<T> {
  result: T
  eventsToInsert?: Event.Insert[]
  ledgerCommand?: LedgerCommand
  ledgerCommands?: LedgerCommand[]
}
