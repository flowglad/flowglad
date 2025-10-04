import * as R from 'ramda'
import { z } from 'zod'
import type { BuildRefine, NoUnknownKeys } from 'drizzle-zod'
import {
  createSelectSchema,
  createInsertSchema,
  createUpdateSchema,
} from 'drizzle-zod'
import { pascalCase } from 'change-case'
import { TIMESTAMPTZ_MS, zodEpochMs } from './timestampMs'
import { getTableColumns } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { PgTableWithId } from './types'
import {
  clientWriteOmitsConstructor,
  hiddenColumnsForClientSchema,
  ommittedColumnsForInsertSchema,
} from './tableUtils'

// ---------- type helpers ----------
type TableColumns<T extends PgTable> = T['_']['columns']
type InsertKeys<T extends PgTable> = keyof T['$inferInsert']
type SelectKeys<T extends PgTable> = keyof T['$inferSelect']

// Columns branded as epoch-ms
type EpochKeys<T extends PgTable> = Extract<
  {
    [K in keyof TableColumns<T>]: TableColumns<T>[K] extends {
      __brand: typeof TIMESTAMPTZ_MS
    }
      ? K
      : never
  }[keyof TableColumns<T>],
  string
>

type EpochInsertKeys<T extends PgTable> = Extract<
  EpochKeys<T>,
  InsertKeys<T>
>
type EpochSelectKeys<T extends PgTable> = Extract<
  EpochKeys<T>,
  SelectKeys<T>
>

// ---------- runtime builders (use getTableColumns) ----------
function epochRefineForInsert<TTable extends PgTable>(
  table: TTable
): BuildRefine<
  Pick<TableColumns<TTable>, EpochInsertKeys<TTable>>,
  undefined
> {
  const cols = getTableColumns(table)
  const item = Object.values(cols)[0]

  const out: Record<string, z.ZodTypeAny> = {}
  for (const [k, col] of Object.entries(cols)) {
    if ((col as any).__brand === TIMESTAMPTZ_MS) out[k] = zodEpochMs
  }
  return out as any
}

function epochRefineForUpdate<TTable extends PgTable>(
  table: TTable
): BuildRefine<
  Pick<TableColumns<TTable>, EpochInsertKeys<TTable>>,
  undefined
> {
  const cols = getTableColumns(table as any) as Record<string, any>
  const out: Record<string, z.ZodTypeAny> = {}
  for (const [k, col] of Object.entries(cols)) {
    if ((col as any).__brand === TIMESTAMPTZ_MS) {
      out[k] = zodEpochMs.optional()
    }
  }
  return out as any
}

function epochRefineForSelect<TTable extends PgTable>(
  table: TTable
): BuildRefine<TableColumns<TTable>, undefined> {
  const cols = getTableColumns(table as any) as Record<string, any>
  const out: Record<string, z.ZodTypeAny> = {}
  for (const [k, col] of Object.entries(cols)) {
    if (
      (col as any).__brand === TIMESTAMPTZ_MS ||
      k === 'createdAt' ||
      k === 'updatedAt'
    ) {
      out[k] = zodEpochMs
    }
  }
  return out as any
}

// Helper to preserve literal keys when extending ZodObject shapes
function toZodShape<S extends Record<string, z.ZodTypeAny>>(
  shape: S
) {
  return shape as { [K in keyof S]: z.ZodTypeAny }
}

// ---------- public factory ----------
export function buildSchemas<
  T extends PgTableWithId,
  D extends
    | Extract<keyof T['$inferSelect'], string>
    | undefined = undefined,
  IR extends BuildRefine<
    Pick<TableColumns<T>, InsertKeys<T>>,
    undefined
  > = {},
  UR extends BuildRefine<
    Pick<TableColumns<T>, InsertKeys<T>>,
    undefined
  > = {},
  SR extends BuildRefine<TableColumns<T>, undefined> = {},
  CR extends BuildRefine<
    Pick<TableColumns<T>, InsertKeys<T>>,
    undefined
  > = {},
  HC extends Partial<Record<keyof T['$inferSelect'], true>> = {},
  ROC extends Partial<Record<keyof T['$inferSelect'], true>> = {},
  COC extends Partial<Record<keyof T['$inferSelect'], true>> = {},
>(
  table: T,
  params?: {
    discriminator?: D
    insertRefine?: IR
    updateRefine?: UR
    selectRefine?: SR
    refine?: CR
    client?: {
      hiddenColumns?: HC
      readOnlyColumns?: ROC
      createOnlyColumns?: COC
    }
    entityName?: string
  }
) {
  const {
    insertRefine: providedInsertRefine,
    updateRefine: providedUpdateRefine,
    selectRefine: providedSelectRefine,
    refine: providedRefine,
  } = params ?? {}

  // Mode-specific epoch overrides
  const insertEpoch = epochRefineForInsert<T>(table)
  const updateEpoch = epochRefineForUpdate<T>(table)
  const selectEpoch = epochRefineForSelect<T>(table)
  // Merge caller refine with epoch overrides (insert/update)

  /**
   * Prioritize the provided insert refine over base refine
   */
  type InsertRefineMerged = Omit<CR, keyof IR> &
    IR &
    typeof insertEpoch
  const insertRefine = {
    ...(providedRefine ?? ({} as CR)),
    ...(providedInsertRefine ?? ({} as IR)),
    ...insertEpoch,
  } as const as InsertRefineMerged

  /**
   * Prioritize the provided update refine over base refine
   */
  type UpdateRefineMerged = Omit<CR, keyof IR | keyof UR> &
    Omit<IR, keyof UR> &
    UR &
    typeof updateEpoch
  const updateRefine = {
    ...(providedRefine ?? ({} as CR)),
    ...(providedInsertRefine ?? ({} as IR)),
    ...(providedUpdateRefine ?? ({} as UR)),
    ...updateEpoch,
  } as const as UpdateRefineMerged

  const selectRefine = {
    ...(providedRefine ?? ({} as CR)),
    ...(providedSelectRefine ?? ({} as SR)),
    ...selectEpoch,
  } as const as SR & CR & typeof selectEpoch

  // ---------- Type-level override helpers (never-proof, preserve optionality) ----------
  type RefineRecord = Record<string | number | symbol, unknown>

  type UnwrapOptional<Z> =
    Z extends z.ZodOptional<infer Inner> ? Inner : Z

  type InferOutput<Z> = Z extends z.ZodTypeAny
    ? z.infer<UnwrapOptional<Z>>
    : never

  type KeysToOverride<Base, BR> = Extract<
    Extract<keyof BR, string>,
    keyof Base
  >

  type OptionalOverrideKeys<Base, BR> = Extract<
    {
      [K in Extract<
        keyof BR,
        string
      >]: BR[K] extends z.ZodOptional<any> ? K : never
    }[Extract<keyof BR, string>],
    keyof Base
  >

  type RequiredOverrideKeys<Base, BR> = Exclude<
    KeysToOverride<Base, BR>,
    OptionalOverrideKeys<Base, BR>
  >

  type OverrideWithRefineKeepOptional<Base, BR> =
    BR extends RefineRecord
      ? Omit<Base, KeysToOverride<Base, BR>> & {
          [K in RequiredOverrideKeys<
            Base,
            BR
          >]: BR[K] extends z.ZodTypeAny
            ? InferOutput<BR[K]>
            : Base[K]
        } & {
          [K in OptionalOverrideKeys<
            Base,
            BR
          >]?: BR[K] extends z.ZodTypeAny
            ? InferOutput<BR[K]>
            : Base[K]
        }
      : Base

  type SelectOut = OverrideWithRefineKeepOptional<
    T['$inferSelect'],
    typeof selectRefine
  >
  type InsertOut = OverrideWithRefineKeepOptional<
    Omit<
      T['$inferInsert'],
      keyof typeof ommittedColumnsForInsertSchema
    >,
    typeof insertRefine
  >
  type UpdateOut = Partial<
    OverrideWithRefineKeepOptional<
      T['$inferInsert'],
      typeof updateRefine
    >
  > &
    ({ id: string } & (D extends string ? { [K in D]: string } : {}))

  // ---------- Build schemas (preserve object methods; refine output via intersection) ----------
  const selectSchemaRaw = createSelectSchema(
    table,
    selectRefine as unknown as NoUnknownKeys<
      BuildRefine<TableColumns<T>, undefined>,
      T['$inferSelect']
    >
  )
  const selectSchema = selectSchemaRaw as typeof selectSchemaRaw &
    z.ZodType<SelectOut>

  const insertSchemaRaw = createInsertSchema(
    table,
    insertRefine as unknown as NoUnknownKeys<
      BuildRefine<Pick<TableColumns<T>, InsertKeys<T>>, undefined>,
      T['$inferInsert']
    >
  ).omit(ommittedColumnsForInsertSchema)
  const insertSchema = insertSchemaRaw as typeof insertSchemaRaw &
    z.ZodType<InsertOut>

  // Use native update schema (already optional-by-default), then require id
  // and if a discriminator is provided, re-apply the literal discriminator from updateRefine as required
  const baseUpdate = createUpdateSchema(
    table,
    updateRefine as unknown as BuildRefine<
      Pick<TableColumns<T>, InsertKeys<T>>,
      undefined
    >
  ).partial()

  if (
    params?.discriminator &&
    !(params.discriminator in updateRefine)
  ) {
    throw new Error(
      `Discriminator ${String(params.discriminator)} not found in updateRefine or base refine. If you specify a discriminator, you must provide an enum value for it in your update or base refine parameters.`
    )
  }

  /**
   * If a discriminator is provided, extend the update schema to have the discriminator value
   * as required
   */
  const updateSchemaRaw = params?.discriminator
    ? baseUpdate.extend({
        id: z.string(),
        [params.discriminator as Extract<
          keyof T['$inferSelect'],
          string
        >]: (updateRefine as Record<string, z.ZodTypeAny>)[
          params.discriminator as string
        ],
      })
    : baseUpdate.extend({ id: z.string() })

  const updateSchema = updateSchemaRaw as typeof updateSchemaRaw &
    z.ZodType<UpdateOut>

  // ---------- Optional client schemas (preserve enums via re-apply after omits) ----------
  const hiddenColumns = (params?.client?.hiddenColumns ?? {}) as HC
  const readOnlyColumns = (params?.client?.readOnlyColumns ??
    {}) as ROC
  const createOnlyColumns = (params?.client?.createOnlyColumns ??
    {}) as COC

  const clientSelectBuilt = (
    Object.keys(hiddenColumns).length
      ? (selectSchemaRaw as unknown as z.ZodObject<any>).omit({
          ...hiddenColumns,
          ...hiddenColumnsForClientSchema,
        } as unknown as Partial<
          Record<keyof ObjShape<typeof selectSchemaRaw>, true>
        >)
      : (selectSchemaRaw as unknown as z.ZodObject<any>).omit(
          hiddenColumnsForClientSchema as unknown as Partial<
            Record<keyof ObjShape<typeof selectSchemaRaw>, true>
          >
        )
  ).extend(
    selectRefine as unknown as Partial<
      ObjShape<typeof selectSchemaRaw>
    >
  )
  type ClientSelectShape = Omit<
    OverrideShapeWithRefine<
      ObjShape<typeof selectSchemaRaw>,
      typeof selectRefine
    >,
    HiddenKeysOnSelect
  >

  let clientSelect = clientSelectBuilt as unknown as WithShape<
    typeof selectSchemaRaw,
    ClientSelectShape
  >
  type ExtendedReadOnlyColumns<TExtend extends string> = Partial<
    Record<keyof T['$inferSelect'] | TExtend, true>
  >
  /**
   * Automatically enforce that livemode and organization values cannot be updated or inserted
   * from client schemas
   */
  if ('livemode' in selectSchemaRaw.shape) {
    ;(
      readOnlyColumns as ExtendedReadOnlyColumns<'livemode'>
    ).livemode = true
  }
  if ('organizationId' in selectSchemaRaw.shape) {
    ;(
      readOnlyColumns as ExtendedReadOnlyColumns<'organizationId'>
    ).organizationId = true
  }

  let clientInsertBase: z.ZodObject<any>
  const insertOmitMask = clientWriteOmitsConstructor({
    ...hiddenColumns,
    ...readOnlyColumns,
  } as Record<string, true>)
  if (Object.keys(insertOmitMask).length) {
    clientInsertBase = (
      insertSchemaRaw as unknown as z.ZodObject<any>
    ).omit(
      insertOmitMask as unknown as Partial<
        Record<keyof ObjShape<typeof insertSchemaRaw>, true>
      >
    )
  } else {
    clientInsertBase = insertSchemaRaw as unknown as z.ZodObject<any>
  }

  const clientInsertBuilt = clientInsertBase.extend(
    insertRefine as unknown as Partial<
      ObjShape<typeof insertSchemaRaw>
    >
  )
  type ClientInsertShape = Omit<
    OverrideShapeWithRefine<
      ObjShape<typeof insertSchemaRaw>,
      typeof insertRefine
    >,
    | HiddenKeysOnInsert
    | ReadOnlyKeysOnInsert
    | 'livemode'
    | 'organizationId'
  >
  // ignoring typescript here which claims this is a possibly infinitely deep type.
  // @ts-ignore - this should be a a ts-expect-error but tsc and ts server treat it differently
  let clientInsert = clientInsertBuilt as unknown as WithShape<
    typeof insertSchemaRaw,
    ClientInsertShape
  >

  let clientUpdateBase: z.ZodObject<any>
  const updateOmitMask = {
    ...clientWriteOmitsConstructor({
      ...hiddenColumns,
      ...readOnlyColumns,
    } as Record<string, true>),
    ...R.omit(['id'], ommittedColumnsForInsertSchema),
  }
  if (Object.keys(updateOmitMask).length) {
    clientUpdateBase = (
      updateSchemaRaw as unknown as z.ZodObject<any>
    ).omit(
      updateOmitMask as unknown as Partial<
        Record<keyof ObjShape<typeof updateSchemaRaw>, true>
      >
    )
  } else {
    clientUpdateBase = (
      updateSchemaRaw as unknown as z.ZodObject<any>
    ).omit(
      ommittedColumnsForInsertSchema as unknown as Partial<
        Record<keyof ObjShape<typeof updateSchemaRaw>, true>
      >
    )
  }
  if (Object.keys(createOnlyColumns).length) {
    clientUpdateBase = clientUpdateBase.omit(
      createOnlyColumns as unknown as Partial<
        Record<keyof ObjShape<typeof updateSchemaRaw>, true>
      >
    )
  }
  const clientUpdateBuilt = clientUpdateBase.extend(
    updateRefine as unknown as Partial<
      ObjShape<typeof updateSchemaRaw>
    >
  )
  type ClientUpdateShape = Omit<
    OverrideShapeWithRefine<
      ObjShape<typeof updateSchemaRaw>,
      typeof updateRefine
    >,
    | HiddenKeysOnUpdate
    | ReadOnlyKeysOnUpdate
    | CreateOnlyKeysOnUpdate
    | 'livemode'
    | 'organizationId'
  >
  // ignoring typescript here which claims this is a possibly infinitely deep type.
  // @ts-ignore - this should be a a ts-expect-error but tsc and ts server treat it differently
  let clientUpdate = clientUpdateBuilt as unknown as WithShape<
    typeof updateSchemaRaw,
    ClientUpdateShape
  >

  if (params?.entityName) {
    clientSelect = clientSelect.meta({
      id: `${pascalCase(params.entityName)}ClientSelectSchema`,
    })
    clientInsert = clientInsert.meta({
      id: `${pascalCase(params.entityName)}ClientInsertSchema`,
    })
    clientUpdate = clientUpdate.meta({
      id: `${pascalCase(params.entityName)}ClientUpdateSchema`,
    })
  }

  // Strong ZodObject assertions without 'any': preserve methods and shapes minus omitted keys
  type ObjShape<TObj> =
    TObj extends z.ZodObject<infer S, infer C> ? S : never
  type WithShape<TObj, NewShape extends z.ZodRawShape> =
    TObj extends z.ZodObject<infer _S, infer C>
      ? z.ZodObject<NewShape, C>
      : never
  type OverrideShapeWithRefine<Base, BR> = BR extends RefineRecord
    ? Omit<Base, KeysToOverride<Base, BR>> & {
        [K in KeysToOverride<Base, BR>]: BR[K] extends z.ZodTypeAny
          ? BR[K]
          : Base[K]
      }
    : Base

  // Keys actually present on each output type (avoid widening to string | number | symbol)
  type HiddenKeysOnSelect = Extract<keyof HC, keyof SelectOut>
  type HiddenKeysOnInsert = Extract<keyof HC, keyof InsertOut>
  type HiddenKeysOnUpdate = Extract<keyof HC, keyof UpdateOut>

  type ReadOnlyKeysOnInsert = Extract<keyof ROC, keyof InsertOut>
  type ReadOnlyKeysOnUpdate = Extract<keyof ROC, keyof UpdateOut>

  type CreateOnlyKeysOnUpdate = Extract<keyof COC, keyof UpdateOut>

  return {
    select: selectSchema,
    insert: insertSchema,
    update: updateSchema,
    client: {
      select: clientSelect,
      insert: clientInsert,
      update: clientUpdate,
    },
  }
}
