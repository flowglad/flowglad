// db-core/schemaTypes.ts

import type { ColumnBaseConfig, SQLWrapper } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

export type { SQLWrapper } from 'drizzle-orm'
export type { PgTable, PgTransaction } from 'drizzle-orm/pg-core'

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

export type PgTableWithId = PgTable & { id: SQLWrapper }
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
