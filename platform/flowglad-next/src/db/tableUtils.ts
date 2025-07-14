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
  ilike,
  or,
} from 'drizzle-orm'
import core, { gitCommitId } from '@/utils/core'
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
  bigserial,
} from 'drizzle-orm/pg-core'
import {
  type DbTransaction,
  type PgTableWithId,
  type PgStringColumn,
  type PgTableWithCreatedAtAndId,
  PgTableWithPosition,
} from '@/db/types'
import { CountryCode, TaxType, SupabasePayloadType } from '@/types'
import { z } from 'zod'
import {
  createSelectSchema,
  createInsertSchema as zodCreateInsertSchema,
} from 'drizzle-zod'
import { noCase, sentenceCase, snakeCase } from 'change-case'

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
  tableName: string
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
  const selectSchema = config.selectSchema

  return async function selectById(
    id: InferSelectModel<T>['id'] extends string ? string : number,
    transaction: DbTransaction
  ): Promise<z.infer<S>> {
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
        `No ${noCase(config.tableName)} found with id: ${id}`
      )
    }
    const result = results[0]
    return selectSchema.parse(result)
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
    return result.map((item) => {
      const parsed = selectSchema.safeParse(item)
      if (!parsed.success) {
        console.error(parsed.error.issues)
        console.error(item)
        throw Error(
          `createInsertManyFunction: Error parsing result: ${JSON.stringify(
            item
          )}`
        )
      }
      return parsed.data
    })
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
    if (!result) {
      const [latestItem] = await transaction
        .select()
        .from(table)
        .where(eq(table.id, update.id))
        .limit(1)
      if (!latestItem) {
        throw Error(
          `No ${noCase(config.tableName)} found with id: ${update.id}`
        )
      }
      return selectSchema.parse(latestItem)
    }
    return selectSchema.parse(result)
  }
}

export const whereClauseFromObject = <T extends PgTableWithId>(
  table: T,
  selectConditions: SelectConditions<T>
) => {
  const keys = Object.keys(selectConditions)
  if (keys.length === 0) {
    return undefined
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
        console.error(item)
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

export const timestampWithTimezoneColumn = (name: string) =>
  timestamp(name, {
    withTimezone: true,
  })

export const createdAtColumn = () =>
  timestampWithTimezoneColumn('created_at').notNull().defaultNow()

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
  updatedAt: timestamp('updated_at', {
    withTimezone: true,
  })
    .defaultNow()
    .$onUpdate(() => new Date()),
  createdByCommit: text('created_by_commit').$defaultFn(gitCommitId),
  updatedByCommit: text('updated_by_commit').$defaultFn(gitCommitId),
  livemode: boolean('livemode').notNull(),
  /**
   * Used for ranking in pagination
   */
  position: bigserial({ mode: 'number' }),
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
 * Ensure that the organization id for this record is consistent with the organization id for its parent table,
 * in the case where there's a foreign key
 * @param parentTableName
 * @param parentIdColumn
 * @returns
 */
interface ParentTableIdIntegrityCheckParams {
  parentTableName: string
  parentIdColumnInCurrentTable: string // FK in the current table pointing to parent's PK
  parentTablePrimaryKeyColumn?: string // PK in parent table, defaults to 'id'
  currentTableName: string
  policyName?: string // Optional custom policy name
}

export const parentForeignKeyIntegrityCheckPolicy = ({
  parentTableName,
  parentIdColumnInCurrentTable,
}: ParentTableIdIntegrityCheckParams) => {
  return pgPolicy(
    `Ensure organization integrity with ${parentTableName} parent table`,
    {
      as: 'permissive',
      to: 'authenticated',
      for: 'all',
      using: sql`${sql.identifier(parentIdColumnInCurrentTable)} in (select ${sql.identifier('id')} from ${sql.identifier(parentTableName)})`,
    }
  )
}

export const membershipOrganizationIdIntegrityCheckPolicy = () => {
  return pgPolicy('Enable read for own organizations', {
    as: 'permissive',
    to: 'authenticated',
    for: 'all',
    using: sql`"organization_id" in (select "organization_id" from "memberships")`,
  })
}

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

/**
 * Can only support single column indexes
 * at this time because of the way we need to construct gin
 * indexes in Drizzle:
 * @see https://orm.drizzle.team/docs/guides/postgresql-full-text-search
 * @param tableName
 * @param column
 * @returns
 */
export const constructGinIndex = (
  tableName: string,
  column: Parameters<IndexBuilderOn['on']>[0]
) => {
  const indexName = createIndexName(tableName, [column], false)
  return index(indexName).using(
    'gin',
    sql`to_tsvector('english', ${column})`
  )
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
  position: z.number(),
} as const

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
  createdByCommit: true,
  updatedByCommit: true,
  position: true,
} as const

export const hiddenColumnsForClientSchema = {
  position: true,
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
    if (parsedData.length === 0) {
      return []
    }
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

export const createPaginatedTableRowOutputSchema = <
  T extends z.ZodType,
>(
  schema: T
) => {
  return z.object({
    items: z.array(schema),
    startCursor: z.string().nullable(),
    endCursor: z.string().nullable(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
    total: z.number(),
  })
}

export const createPaginatedTableRowInputSchema = <
  T extends z.ZodType,
>(
  filterSchema: T
) => {
  return z.object({
    pageAfter: z.string().optional(),
    pageBefore: z.string().optional(),
    pageSize: z.number().min(1).max(100).optional(),
    filters: filterSchema.optional(),
    searchQuery: z.string().optional(),
  })
}

/**
 * A simple tester function to verify that our typescript column mappings map to the
 * enum values in the database.
 * @param table
 * @param column
 * @param enumValues
 * @param transaction
 * @returns
 */
export const testEnumColumn = async <T extends PgTableWithId>(
  table: T,
  column: PgColumn,
  enumValues: Record<string, string>,
  transaction: DbTransaction
) => {
  const result = await transaction
    .select()
    .from(table)
    .where(inArray(column, Object.values(enumValues)))
    .limit(1)
  return result
}

interface TableSearchParams<T extends PgTableWithId> {
  searchQuery?: string
  searchableColumns: T['_']['columns'][string][]
}

interface CursorPaginatedSelectFunctionParams<
  T extends PgTableWithPosition,
> {
  input: {
    pageAfter?: string
    pageBefore?: string
    pageSize?: number
    filters?: SelectConditions<T>
    sortDirection?: 'asc' | 'desc'
    searchQuery?: string
    goToFirst?: boolean
    goToLast?: boolean
  }
  transaction: DbTransaction
}

const cursorComparison = async <T extends PgTableWithPosition>(
  table: T,
  {
    isForward,
    pageAfter,
    pageBefore,
  }: {
    isForward: boolean
    pageAfter?: string
    pageBefore?: string
  },
  transaction: DbTransaction
) => {
  const cursor = pageAfter || pageBefore
  if (!cursor) {
    return undefined
  }
  const results = await transaction
    .select()
    .from(table)
    .where(eq(table.id, cursor))
  if (results.length === 0) {
    return undefined
  }
  const result = results[0]
  const comparisonOperator = isForward ? gt : lt
  /**
   * When we're paginating forward, we want to include the item at the cursor
   * in the results. When we're paginating backward, we don't want to include
   * the item at the cursor in the results.
   *
   * Postgres records time in microseconds (1/1,000,000th) while JS stores
   * in milliseconds. So we need to adjust the time by 1 millisecond,
   * otherwise we get "last item in next" behavior because the cursor
   * isn't the same across languages. Eventually we will want to track each table
   * on an iterator
   */
  return comparisonOperator(table.position, result.position)
}

const constructSearchQueryClause = <T extends PgTableWithId>(
  table: T,
  searchQuery: string,
  searchableColumns: T['_']['columns'][string][]
) => {
  return or(
    ...searchableColumns.map((column) =>
      ilike(column, `%${searchQuery}%`)
    )
  )
}

export const createCursorPaginatedSelectFunction = <
  T extends PgTableWithPosition,
  S extends ZodTableUnionOrType<InferSelectModel<T>>,
  I extends ZodTableUnionOrType<Omit<InferInsertModel<T>, 'id'>>,
  U extends ZodTableUnionOrType<Partial<InferInsertModel<T>>>,
  D extends z.ZodType,
>(
  table: T,
  config: ORMMethodCreatorConfig<T, S, I, U>,
  dataSchema: D,
  enrichmentFunction?: (
    data: z.infer<S>[],
    transaction: DbTransaction
  ) => Promise<z.infer<D>[]>,
  searchableColumns?: T['_']['columns'][string][]
) => {
  const selectSchema = config.selectSchema
  return async function cursorPaginatedSelectFunction(
    params: CursorPaginatedSelectFunctionParams<T>
  ): Promise<{
    items: z.infer<D>[]
    startCursor: string | null
    endCursor: string | null
    hasNextPage: boolean
    hasPreviousPage: boolean
    total: number
  }> {
    const {
      pageAfter,
      pageBefore,
      pageSize = 10,
      goToFirst,
      goToLast,
    } = params.input
    const transaction = params.transaction

    // Handle special navigation cases
    if (goToFirst) {
      // Clear cursors and start from beginning
      const orderBy = [desc(table.createdAt), desc(table.position)]
      const filterClause = params.input.filters
        ? whereClauseFromObject(table, params.input.filters)
        : undefined
      const searchQuery = params.input.searchQuery
      const searchQueryClause =
        searchQuery && searchableColumns
          ? constructSearchQueryClause(
              table,
              searchQuery,
              searchableColumns
            )
          : undefined
      const whereClauses = and(filterClause, searchQueryClause)

      const queryResult = await transaction
        .select()
        .from(table)
        .where(whereClauses)
        .orderBy(...orderBy)
        .limit(pageSize + 1)

      const total = await transaction
        .select({ count: count() })
        .from(table)
        .$dynamic()
        .where(and(filterClause, searchQueryClause))

      const data: z.infer<S>[] = queryResult
        .map((item) => selectSchema.parse(item))
        .slice(0, pageSize)
      const enrichedData: z.infer<D>[] = await (enrichmentFunction
        ? enrichmentFunction(data, transaction)
        : Promise.resolve(data))

      const items: z.infer<D>[] = enrichedData.map((item) =>
        dataSchema.parse(item)
      )
      const startCursor = data.length > 0 ? data[0].id : null
      const endCursor =
        data.length > 0 ? data[data.length - 1].id : null
      const totalCount = total[0].count
      const hasMore = queryResult.length > pageSize

      return {
        items,
        startCursor,
        endCursor,
        hasNextPage: hasMore,
        hasPreviousPage: false,
        total: totalCount,
      }
    }

    if (goToLast) {
      // Fetch the last page by ordering desc and taking the first pageSize items
      const orderBy = [desc(table.createdAt), desc(table.position)]
      const filterClause = params.input.filters
        ? whereClauseFromObject(table, params.input.filters)
        : undefined
      const searchQuery = params.input.searchQuery
      const searchQueryClause =
        searchQuery && searchableColumns
          ? constructSearchQueryClause(
              table,
              searchQuery,
              searchableColumns
            )
          : undefined
      const whereClauses = and(filterClause, searchQueryClause)

      // Get total count first to calculate if we need a partial last page
      const total = await transaction
        .select({ count: count() })
        .from(table)
        .$dynamic()
        .where(and(filterClause, searchQueryClause))

      const totalCount = total[0].count
      const lastPageSize = totalCount % pageSize || pageSize

      const queryResult = await transaction
        .select()
        .from(table)
        .where(whereClauses)
        .orderBy(...orderBy)
        .limit(lastPageSize + 1)

      // Reverse to get ascending order
      const reversedResult = queryResult.reverse()

      const data: z.infer<S>[] = reversedResult
        .map((item) => selectSchema.parse(item))
        .slice(0, lastPageSize)
      const enrichedData: z.infer<D>[] = await (enrichmentFunction
        ? enrichmentFunction(data, transaction)
        : Promise.resolve(data))

      const items: z.infer<D>[] = enrichedData.map((item) =>
        dataSchema.parse(item)
      )
      const startCursor = data.length > 0 ? data[0].id : null
      const endCursor =
        data.length > 0 ? data[data.length - 1].id : null

      return {
        items,
        startCursor,
        endCursor,
        hasNextPage: false,
        hasPreviousPage: totalCount > pageSize,
        total: totalCount,
      }
    }

    // Determine pagination direction and cursor
    const isForward = !!pageAfter || (!pageBefore && !pageAfter)
    const orderBy = isForward
      ? [desc(table.createdAt), desc(table.position)]
      : [asc(table.createdAt), asc(table.position)]
    const filterClause = params.input.filters
      ? whereClauseFromObject(table, params.input.filters)
      : undefined
    const searchQuery = params.input.searchQuery
    const searchQueryClause =
      searchQuery && searchableColumns
        ? constructSearchQueryClause(
            table,
            searchQuery,
            searchableColumns
          )
        : undefined
    const whereClauses = and(
      await cursorComparison(
        table,
        {
          isForward,
          pageAfter,
          pageBefore,
        },
        transaction
      ),
      filterClause,
      searchQueryClause
    )

    // Query for items
    let queryResult = await transaction
      .select()
      .from(table)
      .where(whereClauses)
      .orderBy(...orderBy)
      .limit(pageSize + 1)
    if (!isForward) {
      queryResult = queryResult.reverse()
    }

    const total = await transaction
      .select({ count: count() })
      .from(table)
      .$dynamic()
      .where(filterClause)

    const data: z.infer<S>[] = queryResult
      .map((item) => selectSchema.parse(item))
      .slice(0, pageSize)
    const enrichedData: z.infer<D>[] = await (enrichmentFunction
      ? enrichmentFunction(data, transaction)
      : Promise.resolve(data))

    // Slice to pageSize and get cursors
    const items: z.infer<D>[] = enrichedData.map((item) =>
      dataSchema.parse(item)
    )
    const startCursor = data.length > 0 ? data[0].id : null
    const endCursor =
      data.length > 0 ? data[data.length - 1].id : null
    const totalCount = total[0].count
    const moreThanOnePage = totalCount > pageSize
    // Check for next/previous pages
    const hasMore = queryResult.length > pageSize
    const hasNextPage = isForward ? hasMore : moreThanOnePage // If paginating backward, we can't determine hasNextPage
    const hasPreviousPage = isForward ? moreThanOnePage : hasMore // If paginating forward, we can't determine hasPreviousPage
    return {
      items,
      startCursor,
      endCursor,
      hasNextPage,
      hasPreviousPage,
      total: totalCount,
    }
  }
}
