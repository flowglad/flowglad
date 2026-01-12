import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

export type { PgTable, PgTransaction } from 'drizzle-orm/pg-core'

import type { ColumnBaseConfig, SQLWrapper } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { CacheDependencyKey } from '@/utils/cache'
import type { LedgerCommand } from './ledgerManager/ledgerManagerTypes'
import type { Event } from './schema/events'

export type { SQLWrapper } from 'drizzle-orm'

export type DbTransaction = Parameters<
  Parameters<
    PostgresJsDatabase<Record<string, never>>['transaction']
  >[0]
>[0]

export type PgNumberColumn = PgColumn<
  ColumnBaseConfig<'number', 'number'>,
  {},
  {}
>

export type PgSerialColumn = PgColumn<
  ColumnBaseConfig<'number', 'serial'>,
  {},
  {}
>

export type PgStringColumn = PgColumn<
  ColumnBaseConfig<'string', 'string'>,
  {},
  {}
>

// For timestampWithTimezoneColumn() columns only - stores ms as numbers, timezone-aware
export type PgTimestampColumn = PgColumn<
  {
    name: string
    tableName: string
    dataType: 'custom'
    columnType: 'PgCustomColumn'
    data: number
    driverParam: string | Date
    notNull: boolean
    hasDefault: boolean
    isPrimaryKey: boolean
    isAutoincrement: boolean
    hasRuntimeDefault: boolean
    enumValues: undefined
    baseColumn: never
    identity: undefined
    generated: undefined
  },
  {},
  {}
>

export type PgTableWithId = PgTable & {
  id: SQLWrapper
}

export type PgTableWithCreatedAtAndId = PgTable & {
  createdAt: SQLWrapper
  id: SQLWrapper
}

export type PgTableWithPosition = PgTable & {
  position: SQLWrapper
  createdAt: SQLWrapper
  id: SQLWrapper
}

export type PgTableWithIdAndPricingModelId = PgTable & {
  id: SQLWrapper
  pricingModelId: SQLWrapper
}

/**
 * Accumulated side effects that are processed after the transaction commits.
 * Effects are collected via helper methods on transaction params.
 */
export interface TransactionEffects {
  cacheInvalidations: CacheDependencyKey[]
  eventsToInsert: Event.Insert[]
  ledgerCommands: LedgerCommand[]
}

export interface AuthenticatedTransactionParams {
  transaction: DbTransaction
  livemode: boolean
  userId: string
  organizationId: string
  /**
   * Accumulated side effects. Only available when using transaction wrappers.
   * Prefer using the helper methods below.
   */
  effects?: TransactionEffects
  /**
   * Queue cache dependency keys to be invalidated after the transaction commits.
   * Use CacheDependency helpers to construct keys.
   * Only available when using transaction wrappers (authenticatedTransaction, etc.).
   *
   * @example
   * params.invalidateCache?.(
   *   CacheDependency.subscriptionItemFeatures(itemId),
   *   CacheDependency.customerSubscriptions(customerId)
   * )
   */
  invalidateCache?: (...keys: CacheDependencyKey[]) => void
  /**
   * Queue events to be inserted before the transaction commits.
   * Only available when using transaction wrappers.
   *
   * @example
   * params.emitEvent?.(createSubscriptionCreatedEvent(subscription))
   */
  emitEvent?: (...events: Event.Insert[]) => void
  /**
   * Queue ledger commands to be processed before the transaction commits.
   * Only available when using transaction wrappers.
   *
   * @example
   * params.enqueueLedgerCommand?.(creditCommand)
   */
  enqueueLedgerCommand?: (...commands: LedgerCommand[]) => void
}

export interface AdminTransactionParams {
  transaction: DbTransaction
  userId: 'ADMIN'
  livemode: boolean
  /**
   * Accumulated side effects. Only available when using transaction wrappers.
   * Prefer using the helper methods below.
   */
  effects?: TransactionEffects
  /**
   * Queue cache dependency keys to be invalidated after the transaction commits.
   * Use CacheDependency helpers to construct keys.
   * Only available when using transaction wrappers.
   */
  invalidateCache?: (...keys: CacheDependencyKey[]) => void
  /**
   * Queue events to be inserted before the transaction commits.
   * Only available when using transaction wrappers.
   */
  emitEvent?: (...events: Event.Insert[]) => void
  /**
   * Queue ledger commands to be processed before the transaction commits.
   * Only available when using transaction wrappers.
   */
  enqueueLedgerCommand?: (...commands: LedgerCommand[]) => void
}
