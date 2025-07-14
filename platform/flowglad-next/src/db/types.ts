import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
export type { PgTable, PgTransaction } from 'drizzle-orm/pg-core'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { ColumnBaseConfig, SQLWrapper } from 'drizzle-orm'
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

export interface AuthenticatedTransactionParams {
  transaction: DbTransaction
  livemode: boolean
  userId: string
}

export interface AdminTransactionParams {
  transaction: DbTransaction
  userId: 'ADMIN'
  livemode: boolean
}
