// schemaFactory.ts
import { z } from 'zod'
import type { BuildRefine, NoUnknownKeys } from 'drizzle-zod'
import {
  createSelectSchema,
  createInsertSchema,
  createUpdateSchema,
} from 'drizzle-zod'
import { TIMESTAMPTZ_MS, zEpochMs } from './timestampMs'
import { PgTable } from 'drizzle-orm/pg-core'
import { PgTableWithId } from './types'
import { ommittedColumnsForInsertSchema } from './tableUtils'

// ----- helpers to extract table shapes -----
type TableColumns<T> = T extends PgTable ? T['_']['columns'] : never
type InsertKeys<T> = Extract<keyof T, '$inferInsert'>
type SelectKeys<T> = Extract<keyof T, '$inferSelect'>

// Keys of columns that are branded as epoch
type EpochKeys<T> = Extract<
  {
    [K in keyof TableColumns<T>]: TableColumns<T>[K] extends {
      __brand: typeof TIMESTAMPTZ_MS
    }
      ? K
      : never
  }[keyof TableColumns<T>],
  string
>

type EpochInsertKeys<T> = Extract<EpochKeys<T>, InsertKeys<T>>
type EpochSelectKeys<T> = Extract<EpochKeys<T>, SelectKeys<T>>

// Build a correctly-typed BuildRefine for each mode
function epochRefineForInsert<TTable>(
  table: TTable
): BuildRefine<
  Pick<TableColumns<TTable>, EpochInsertKeys<TTable>>,
  undefined
> {
  const cols = (table as any)._.columns as Record<string, any>
  const out: Record<string, z.ZodTypeAny> = {}
  for (const [k, col] of Object.entries(cols)) {
    if ((col as any).__brand === TIMESTAMPTZ_MS) out[k] = zEpochMs
  }
  return out as any
}

function epochRefineForUpdate<TTable>(
  table: TTable
): BuildRefine<
  Pick<TableColumns<TTable>, EpochInsertKeys<TTable>>,
  undefined
> {
  const cols = (table as any)._.columns as Record<string, any>
  const out: Record<string, z.ZodTypeAny> = {}
  for (const [k, col] of Object.entries(cols)) {
    if ((col as any).__brand === TIMESTAMPTZ_MS)
      out[k] = zEpochMs.optional()
  }
  return out as any
}

function epochRefineForSelect<TTable>(
  table: TTable
): BuildRefine<
  Pick<TableColumns<TTable>, EpochSelectKeys<TTable>>,
  undefined
> {
  const cols = (table as any)._.columns as Record<string, any>
  const out: Record<string, z.ZodTypeAny> = {}
  for (const [k, col] of Object.entries(cols)) {
    if ((col as any).__brand === TIMESTAMPTZ_MS)
      out[k] = z.number().int()
  }
  return out as any
}

export function buildSchemas<T extends PgTableWithId>(
  table: T,
  refine?: BuildRefine<
    Pick<TableColumns<T>, InsertKeys<T>>,
    undefined
  >
) {
  // Mode-specific epoch overrides (fully typed)
  const insertEpoch = epochRefineForInsert<T>(table)
  const updateEpoch = epochRefineForUpdate<T>(table)
  const selectEpoch = epochRefineForSelect<T>(table)

  // Merge caller refine with epoch overrides for insert/update
  const insertRefine = {
    ...(refine ?? {}),
    ...insertEpoch,
  } as unknown as NoUnknownKeys<
    BuildRefine<
      Pick<TableColumns<T>, Extract<keyof T['$inferInsert'], string>>,
      undefined
    >,
    T['$inferInsert']
  >

  const updateRefine = {
    ...(refine ?? {}),
    ...updateEpoch,
  } as unknown as BuildRefine<
    Pick<TableColumns<T>, Extract<keyof T['$inferInsert'], string>>,
    undefined
  >

  // For select we only add the epoch number coercion; merge your own later if you like
  const selectRefine = selectEpoch as unknown as BuildRefine<
    Pick<TableColumns<T>, Extract<keyof T['$inferSelect'], string>>,
    undefined
  >
  // @ts-expect-error
  const insertSchema = createInsertSchema(table, insertRefine).omit(
    ommittedColumnsForInsertSchema
  )
  return {
    // @ts-expect-error
    select: createSelectSchema(table, selectRefine),
    insert: insertSchema,
    update: insertSchema.partial().extend(updateRefine),
  }
}
