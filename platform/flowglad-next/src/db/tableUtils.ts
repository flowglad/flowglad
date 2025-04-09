import * as R from 'ramda'
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  InferInsertModel,
  InferSelectModel,
  lt,
  sql,
  count,
  SQL,
} from 'drizzle-orm'
import core from '@/utils/core'
import {
  boolean,
  integer,
  pgEnum,
  text,
  timestamp,
  IndexBuilderOn,
  uniqueIndex,
  index,
  IndexColumn,
  PgUpdateSetSource,
  PgColumn,
  pgPolicy,
} from 'drizzle-orm/pg-core'
import {
  type DbTransaction,
  type PgTableWithId,
  type PgStringColumn,
  type PgTableWithCreatedAtAndId,
} from '@/db/types'
import { CountryCode, TaxType, SupabasePayloadType } from '@/types'
import { z } from 'zod'
import {
  createSelectSchema,
  createInsertSchema as zodCreateInsertSchema,
} from 'drizzle-zod'
import { snakeCase } from 'change-case'

type ZodTableUnionOrType<
  T extends
    | InferSelectModel<PgTableWithId>
    | InferInsertModel<PgTableWithId>,
> =
  | z.ZodType<T, any, any>
  | z.ZodUnion<[z.ZodType<T, any, any>, ...z.ZodType<T, any, any>[]]>
  | z.ZodDiscriminatedUnion<
      string,
      z.ZodDiscriminatedUnionOption<string>[]
    >

export interface ORMMethodCreatorConfig<
  T extends PgTableWithId,
  S extends ZodTableUnionOrType<InferSelectModel<T>>,
  I extends ZodTableUnionOrType<Omit<InferInsertModel<T>, 'id'>>,
  U extends ZodTableUnionOrType<Partial<InferInsertModel<T>>>,
> {
  selectSchema: S
  insertSchema: I
  updateSchema: U
}

export const createSelectById = <
  T extends PgTableWithId,
  S extends ZodTableUnionOrType<InferSelectModel<T>>,
  I extends ZodTableUnionOrType<Omit<InferInsertModel<T>, 'id'>>,
  U extends ZodTableUnionOrType<Partial<InferInsertModel<T>>>,
>(
  table: T,
  config: ORMMethodCreatorConfig<T, S, I, U>
) => {
  const selectSchema = config?.selectSchema

  return async (
    id: InferSelectModel<T>['id'] extends string ? string : number,
    transaction: DbTransaction
  ): Promise<z.infer<S>> => {
    /**
     * NOTE we don't simply use selectByIds here
     * because a simple equality check is generally more performant
     */
    const results = await transaction
      .select()
      .from(table)
      .where(eq(table.id, id))
    if (results.length === 0) {
      throw Error(
        `selectById: No results found for ${table._.name}, id: ${id}`
      )
    }
    const result = results[0]
    return selectSchema ? selectSchema.parse(result) : result
  }
}

export const createInsertManyFunction = <
  T extends PgTableWithId,
  S extends ZodTableUnionOrType<InferSelectModel<T>>,
  I extends ZodTableUnionOrType<Omit<InferInsertModel<T>, 'id'>>,
  U extends ZodTableUnionOrType<Partial<InferInsertModel<T>>>,
>(
  table: T,
  config: ORMMethodCreatorConfig<T, S, I, U>
) => {
  const insertSchema = config.insertSchema
  const selectSchema = config.selectSchema

  return async (
    insert: z.infer<I>[],
    transaction: DbTransaction
  ): Promise<z.infer<S>[]> => {
    const parsedInsert = insert.map((insert) =>
      insertSchema.parse(insert)
    ) as InferInsertModel<T>[]
    const result = await transaction
      .insert(table)
      .values(parsedInsert)
      .returning()
    return result.map((item) => selectSchema.parse(item))
  }
}

export const createInsertFunction = <
  T extends PgTableWithId,
  S extends z.ZodType<InferSelectModel<T>, any, any>,
  I extends ZodTableUnionOrType<Omit<InferInsertModel<T>, 'id'>>,
  U extends ZodTableUnionOrType<Partial<InferInsertModel<T>>>,
>(
  table: T,
  config: ORMMethodCreatorConfig<T, S, I, U>
) => {
  const insertMany = createInsertManyFunction(table, config)
  return async (
    insert: z.infer<I>,
    transaction: DbTransaction
  ): Promise<z.infer<S>> => {
    const [result] = await insertMany([insert], transaction)
    return result
  }
}

export const createUpdateFunction = <
  T extends PgTableWithId,
  S extends ZodTableUnionOrType<InferSelectModel<T>>,
  I extends ZodTableUnionOrType<Omit<InferInsertModel<T>, 'id'>>,
  U extends ZodTableUnionOrType<Partial<InferInsertModel<T>>>,
>(
  table: T,
  config: ORMMethodCreatorConfig<T, S, I, U>
) => {
  const updateSchema = config.updateSchema
  const selectSchema = config.selectSchema

  return async (
    update: z.infer<typeof updateSchema> & { id: string },
    transaction: DbTransaction
  ): Promise<z.infer<S>> => {
    const parsedUpdate = updateSchema.parse(
      update
    ) as InferInsertModel<T>
    const [result] = await transaction
      .update(table)
      .set({
        ...parsedUpdate,
        updatedAt: new Date(),
      })
      .where(eq(table.id, update.id))
      .returning()
    return selectSchema.parse(result)
  }
}

export const whereClauseFromObject = <T extends PgTableWithId>(
  table: T,
  selectConditions: SelectConditions<T>
) => {
  const keys = Object.keys(selectConditions)
  if (keys.length === 0) {
    throw new Error('No selection conditions provided')
  }
  const conditions = keys.map((key) => {
    if (Array.isArray(selectConditions[key])) {
      return inArray(
        table[key as keyof typeof table] as PgColumn,
        selectConditions[key]
      )
    }
    return eq(
      table[key as keyof typeof table] as PgColumn,
      selectConditions[key as keyof typeof selectConditions]
    )
  })

  const whereClause =
    conditions.length > 1 ? and(...conditions) : conditions[0]
  return whereClause
}

export type DBMethodReturn<
  T extends PgTableWithId,
  S extends ZodTableUnionOrType<InferSelectModel<T>>,
> = z.infer<S>[]

export type SelectConditions<T extends PgTableWithId> = {
  [K in keyof Partial<InferSelectModel<T>>]:
    | InferSelectModel<T>[K]
    | InferSelectModel<T>[K][]
}

export const createSelectFunction = <
  T extends PgTableWithId,
  S extends ZodTableUnionOrType<InferSelectModel<T>>,
  I extends ZodTableUnionOrType<Omit<InferInsertModel<T>, 'id'>>,
  U extends ZodTableUnionOrType<Partial<InferInsertModel<T>>>,
>(
  table: T,
  config: ORMMethodCreatorConfig<T, S, I, U>
) => {
  const selectSchema = config.selectSchema

  return async (
    selectConditions: SelectConditions<T>,
    transaction: DbTransaction
  ): Promise<DBMethodReturn<T, S>> => {
    let query = transaction.select().from(table).$dynamic()
    if (!R.isEmpty(selectConditions)) {
      query = query.where(
        whereClauseFromObject(table, selectConditions)
      )
    }
    const result = await query
    return result.map((item) => {
      const parsed = selectSchema.safeParse(item)
      if (!parsed.success) {
        console.error(parsed.error.issues)
        throw Error(
          `createSelectFunction: Error parsing result: ${JSON.stringify(
            item
          )}`
        )
      }
      return parsed.data
    }) as InferSelectModel<T>[]
  }
}

export const selectByIds = <TTable extends PgTableWithId>(
  table: TTable,
  ids: number[],
  transaction: DbTransaction
) => {
  return transaction
    .select()
    .from(table)
    .where(inArray(table.id, ids))
}

export const activeColumn = () =>
  boolean('active').notNull().default(true)
export const descriptionColumn = () => text('description')
export const createdAtColumn = () =>
  timestamp('created_at').notNull().defaultNow()
export const sequenceNumberColumn = () => integer('sequence_number')

export const tableBase = (idPrefix?: string) => ({
  id: text('id')
    .primaryKey()
    .unique()
    .$defaultFn(
      () => `${idPrefix ? `${idPrefix}_` : ''}${core.nanoid()}`
    )
    .notNull(),
  createdAt: createdAtColumn(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date()),
  livemode: boolean('livemode').notNull(),
})

export const taxColumns = () => ({
  taxAmount: integer('tax_amount'),
  subtotal: integer('subtotal'),
  stripeTaxCalculationId: text('stripe_tax_calculation_id'),
  stripeTaxTransactionId: text('stripe_tax_transaction_id'),
  taxType: pgEnumColumn({
    enumName: 'TaxType',
    columnName: 'tax_type',
    enumBase: TaxType,
  }),
  /**
   * Tax columns
   */
  taxCountry: pgEnumColumn({
    enumName: 'CountryCode',
    columnName: 'tax_country',
    enumBase: CountryCode,
  }),
  taxState: text('tax_state'),
  taxRatePercentage: text('tax_rate_percentage'),
  /**
   * The Flowglad processing fee
   */
  applicationFee: integer('application_fee'),
})

export const taxSchemaColumns = {
  taxCountry: core.createSafeZodEnum(CountryCode),
  taxType: core.createSafeZodEnum(TaxType).nullable(),
}

export const livemodePolicy = () =>
  pgPolicy('Check mode', {
    as: 'restrictive',
    to: 'authenticated',
    for: 'all',
    using: sql`current_setting('app.livemode')::boolean = livemode`,
  })

/**
 * Generates a pgEnum column declaration from a TypeScript enum,
 * giving the enum the name of the column
 */
export const pgEnumColumn = <
  T extends Record<string, string | number>,
>(params: {
  enumName: string
  columnName: string
  enumBase: T
}) => {
  const columnType = pgEnum(
    params.enumName,
    Object.values(params.enumBase).map((value) =>
      value.toString()
    ) as [string, ...string[]]
  )
  return columnType(params.columnName)
}

/**
 * Generates a set of values for an onConflictDoUpdate statement,
 * using the column names of the table
 */
export const onConflictDoUpdateSetValues = <
  TTable extends PgTableWithId,
>(
  table: TTable,
  excludeColumns: string[] = []
): PgUpdateSetSource<TTable> => {
  const keys = Object.keys(table)
    .filter(
      (key) =>
        !Object.keys(tableBase()).includes(key) &&
        !excludeColumns.includes(key)
    )
    .map((key) => key as keyof TTable['$inferInsert'])

  return keys.reduce((acc, key) => {
    return {
      ...acc,
      [key]: sql`excluded.${sql.identifier(
        /**
         * While it should never happen,
         * technically, table columns as per $inferInsert
         * can be symbols - this strips the symbol wrapper,
         * which is included in the stringified key
         */
        snakeCase(key.toString().replace(/^Symbol\((.*)\)$/, '$1'))
      )}`,
    }
  }, {})
}

export const createIndexName = (
  tableName: string,
  columns: Parameters<IndexBuilderOn['on']>,
  isUnique: boolean = false
) => {
  /**
   * In types columns will show up as strings, but at runtime they're
   * actually objects with a name property
   */
  const columnObjects = columns as unknown as { name: string }[]
  return (
    tableName +
    '_' +
    columnObjects.map((column) => column.name).join('_') +
    (isUnique ? '_unique' : '') +
    '_idx'
  )
}

export const constructUniqueIndex = (
  tableName: string,
  columns: Parameters<IndexBuilderOn['on']>
) => {
  const indexName = createIndexName(tableName, columns, true)
  return uniqueIndex(indexName).on(...columns)
}

export const constructIndex = (
  tableName: string,
  columns: Parameters<IndexBuilderOn['on']>
) => {
  const indexName = createIndexName(tableName, columns)
  return index(indexName).on(...columns)
}

export const newBaseZodSelectSchemaColumns = {
  createdAt: core.safeZodDate,
  updatedAt: core.safeZodDate,
}

/**
 * Truthfully this is a "createFindOrCreateFunction"
 * - it doesn't do the "up" part of "upsert"
 * @param table
 * @param target
 * @param config
 * @returns
 */
export const createUpsertFunction = <
  T extends PgTableWithId,
  S extends ZodTableUnionOrType<InferSelectModel<T>>,
  I extends ZodTableUnionOrType<Omit<InferInsertModel<T>, 'id'>>,
  U extends ZodTableUnionOrType<Partial<InferInsertModel<T>>>,
>(
  table: T,
  target: IndexColumn | IndexColumn[],
  config: ORMMethodCreatorConfig<T, S, I, U>
) => {
  const selectSchema = config.selectSchema
  const insertSchema = config.insertSchema

  const upsertFunction = async (
    data: z.infer<I> | z.infer<I>[],
    transaction: DbTransaction
  ): Promise<z.infer<S>[]> => {
    const dataArray = Array.isArray(data) ? data : [data]
    const insertData = dataArray.map(
      (data) => insertSchema.parse(data) as InferInsertModel<T>
    )
    const result = await transaction
      .insert(table)
      .values(insertData)
      .onConflictDoNothing({
        target,
      })
      .returning()
    return result.map((data) => selectSchema.parse(data)) as z.infer<
      typeof selectSchema
    >[]
  }

  return upsertFunction
}

export const notNullStringForeignKey = (
  column: string,
  refTable: PgTableWithId
) => {
  return text(column)
    .notNull()
    .references(() => refTable.id as PgStringColumn)
}

export const nullableStringForeignKey = (
  column: string,
  refTable: PgTableWithId
) => {
  return text(column).references(() => refTable.id as PgStringColumn)
}

export const ommittedColumnsForInsertSchema = {
  id: true,
  createdAt: true,
  updatedAt: true,
} as const

type SchemaRefinements<T extends PgTableWithId> = Parameters<
  typeof zodCreateInsertSchema<T>
>[1]

export const enhancedCreateInsertSchema = <T extends PgTableWithId>(
  table: T,
  refine: SchemaRefinements<T>
) => {
  return zodCreateInsertSchema(table, refine).omit(
    ommittedColumnsForInsertSchema
  )
}

export const createPaginatedSelectSchema = <T extends {}>(
  parameters: ZodTableUnionOrType<T>
) => {
  return z.object({
    cursor: z.string().optional(),
    limit: z.number().min(1).max(100).optional(),
  }) as z.ZodType<{
    cursor?: string
    limit?: number
  }>
}

export const createSupabaseWebhookSchema = <T extends PgTableWithId>({
  table,
  tableName,
  refine,
}: {
  table: T
  tableName: string
  refine?: Parameters<
    ReturnType<typeof createSelectSchema<T>>['extend']
  >[0]
}) => {
  const selectSchema = refine
    ? createSelectSchema(table).extend(refine)
    : createSelectSchema(table)

  const supabaseInsertPayloadSchema = z.object({
    type: z.literal(SupabasePayloadType.INSERT),
    table: z.literal(tableName),
    schema: z.string(),
    record: selectSchema,
  })
  const supabaseUpdatePayloadSchema = z.object({
    type: z.literal(SupabasePayloadType.UPDATE),
    table: z.literal(tableName),
    schema: z.string(),
    record: selectSchema,
    old_record: selectSchema,
  })
  return {
    supabaseInsertPayloadSchema,
    supabaseUpdatePayloadSchema,
  }
}

export const createUpdateSchema = <T extends PgTableWithId>(
  table: T,
  refine?: SchemaRefinements<T>
) => {
  return enhancedCreateInsertSchema(table, refine).partial().extend({
    id: z.string(),
  })
}

export const createBulkInsertFunction = <
  T extends PgTableWithId,
  S extends ZodTableUnionOrType<InferSelectModel<T>>,
  I extends ZodTableUnionOrType<Omit<InferInsertModel<T>, 'id'>>,
  U extends ZodTableUnionOrType<Partial<InferInsertModel<T>>>,
>(
  table: T,
  config: ORMMethodCreatorConfig<T, S, I, U>
) => {
  const insertSchema = config.insertSchema
  return async (
    data: z.infer<I>[],
    transaction: DbTransaction
  ): Promise<z.infer<S>[]> => {
    const dataArray = Array.isArray(data) ? data : [data]
    const parsedData = dataArray.map((data) =>
      insertSchema.parse(data)
    ) as InferInsertModel<T>[]
    if (dataArray.length === 0) {
      return []
    }
    const result = await transaction
      .insert(table)
      .values(parsedData)
      .returning()
    return result.map((data) => config.selectSchema.parse(data))
  }
}

export const createBulkInsertOrDoNothingFunction = <
  T extends PgTableWithId,
  S extends ZodTableUnionOrType<InferSelectModel<T>>,
  I extends ZodTableUnionOrType<Omit<InferInsertModel<T>, 'id'>>,
  U extends ZodTableUnionOrType<Partial<InferInsertModel<T>>>,
>(
  table: T,
  config: ORMMethodCreatorConfig<T, S, I, U>
) => {
  return async (
    data: z.infer<I>[],
    target: IndexColumn | IndexColumn[],
    transaction: DbTransaction
  ): Promise<z.infer<S>[]> => {
    const dataArray = Array.isArray(data) ? data : [data]
    const parsedData = dataArray.map((data) =>
      config.insertSchema.parse(data)
    ) as InferInsertModel<T>[]
    const result = await transaction
      .insert(table)
      .values(parsedData)
      .onConflictDoNothing({
        target,
      })
      .returning()
    return result.map((data) => config.selectSchema.parse(data))
  }
}

export const createBulkUpsertFunction = <
  T extends PgTableWithId,
  S extends ZodTableUnionOrType<InferSelectModel<T>>,
  I extends ZodTableUnionOrType<Omit<InferInsertModel<T>, 'id'>>,
  U extends ZodTableUnionOrType<Partial<InferInsertModel<T>>>,
>(
  table: T,
  config: ORMMethodCreatorConfig<T, S, I, U>
) => {
  return async (
    data: z.infer<I>[],
    target: IndexColumn | IndexColumn[],
    transaction: DbTransaction
  ): Promise<z.infer<S>[]> => {
    const dataArray = Array.isArray(data) ? data : [data]
    const parsedData = dataArray.map((data) =>
      config.insertSchema.parse(data)
    ) as InferInsertModel<T>[]
    const result = await transaction
      .insert(table)
      .values(parsedData)
      .onConflictDoUpdate({
        target,
        set: onConflictDoUpdateSetValues(table, ['id', 'created_at']),
      })
      .returning()
    return result.map((data) => config.selectSchema.parse(data))
  }
}

export const makeSchemaPropNull = <T extends z.ZodType<any, any>>(
  schema: T
) => {
  return schema.transform(() => null).nullish()
}

export const createDeleteFunction = <T extends PgTableWithId>(
  table: T
) => {
  return async (
    id: number | string,
    transaction: DbTransaction
  ): Promise<void> => {
    await transaction.delete(table).where(eq(table.id, id))
  }
}

export const idInputSchema = z.object({
  id: z.string(),
})

export const externalIdInputSchema = z.object({
  externalId: z
    .string()
    .describe(
      'The ID of the customer, as defined in your application'
    ),
})

type PaginationDirection = 'forward' | 'backward'

export const encodeCursor = <T extends PgTableWithId>({
  parameters,
  createdAt = new Date(0),
  direction = 'forward',
}: {
  parameters: SelectConditions<T>
  createdAt?: Date
  direction?: PaginationDirection
}) => {
  return Buffer.from(
    `${JSON.stringify({ parameters, createdAt, direction })}`
  ).toString('base64')
}

/**
 *
 * @param cursor a string of the form `{"parameters": {...}, "createdAt": "2024-01-01T00:00:00.000Z"}`
 */
export const decodeCursor = (cursor: string) => {
  const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString())
  return {
    parameters: decoded.parameters,
    createdAt: new Date(decoded.createdAt),
    direction: decoded.direction,
  }
}

export const createPaginatedSelectFunction = <
  T extends PgTableWithCreatedAtAndId,
  S extends ZodTableUnionOrType<InferSelectModel<T>>,
  I extends ZodTableUnionOrType<Omit<InferInsertModel<T>, 'id'>>,
  U extends ZodTableUnionOrType<Partial<InferInsertModel<T>>>,
>(
  table: T,
  config: ORMMethodCreatorConfig<T, S, I, U>
) => {
  const selectSchema = config.selectSchema
  return async (
    {
      cursor,
      limit = 10,
    }: {
      cursor?: string
      limit?: number
    },
    transaction: DbTransaction
  ): Promise<{
    data: z.infer<S>[]
    currentCursor?: string
    nextCursor?: string
    hasMore: boolean
    total: number
  }> => {
    if (limit > 100) {
      throw new Error(
        'Paginated Select Function limit must be less than or equal to 100. Received: ' +
          limit
      )
    }
    const { parameters, createdAt, direction } = cursor
      ? decodeCursor(cursor)
      : {
          parameters: {},
          createdAt: new Date(),
          direction: 'forward',
        }
    let query = transaction.select().from(table).$dynamic()
    if (Object.keys(parameters).length > 0) {
      query = query.where(
        and(
          whereClauseFromObject(table, parameters),
          direction === 'forward'
            ? gt(table.createdAt, createdAt)
            : lt(table.createdAt, createdAt)
        )
      )
    }
    const queryLimit = limit + 1
    query = query
      .orderBy(
        direction === 'forward'
          ? asc(table.createdAt)
          : desc(table.createdAt)
      )
      .limit(queryLimit)
    const result = await query

    // Check if we got an extra item
    const hasMore = result.length > limit
    // Remove the extra item if it exists
    const data = result.slice(0, limit)
    let totalQuery = transaction
      .select({ count: count() })
      .from(table)
      .$dynamic()
    if (Object.keys(parameters).length > 0) {
      totalQuery = totalQuery.where(
        whereClauseFromObject(table, parameters)
      )
    }
    const total = await totalQuery
    return {
      data: data.map((item) => selectSchema.parse(item)),
      currentCursor: cursor,
      nextCursor: hasMore
        ? encodeCursor({
            parameters,
            createdAt: data[data.length - 1].createdAt as Date,
            direction,
          })
        : undefined,
      hasMore,
      total: total[0].count,
    }
  }
}

export const createPaginatedListQuerySchema = <T extends z.ZodType>(
  schema: T
) => {
  return z.object({
    data: z.array(schema),
    currentCursor: z.string().optional(),
    nextCursor: z.string().optional(),
    hasMore: z.boolean(),
    total: z.number(),
  }) as z.ZodType<{
    data: z.infer<T>[]
    currentCursor?: string
    nextCursor?: string
    total: number
    hasMore: boolean
  }>
}

export const metadataSchema = z.record(z.string(), z.any())
