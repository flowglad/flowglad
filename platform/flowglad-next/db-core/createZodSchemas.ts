import { pascalCase } from 'change-case'
import { getTableColumns } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { BuildRefine, NoUnknownKeys } from 'drizzle-zod'
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod'
import * as R from 'ramda'
import { z } from 'zod'
import type { PgTableWithId } from './schemaTypes'
import {
  clientWriteOmitsConstructor,
  hiddenColumnsForClientSchema,
  ommittedColumnsForInsertSchema,
} from './tableUtils'
import { type TIMESTAMPTZ_MS, zodEpochMs } from './timestampMs'

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

  const out: BuildRefine<
    Pick<TableColumns<TTable>, EpochInsertKeys<TTable>>,
    undefined
  > = {}
  for (const [k, col] of Object.entries(cols)) {
    /**
     * skip created_at and updated_at columns since they are non-insertable
     */
    if (col.name === 'created_at' || col.name === 'updated_at') {
      continue
    }
    if (col.getSQLType() === 'timestamptz') {
      // @ts-expect-error - zodPipe not expected to be in refine
      out[k as EpochInsertKeys<TTable>] = col.notNull
        ? col.hasDefault
          ? zodEpochMs.optional()
          : zodEpochMs
        : zodEpochMs.nullable().optional()
    }
  }
  return out
}

function epochRefineForUpdate<TTable extends PgTable>(
  table: TTable
): BuildRefine<
  Pick<TableColumns<TTable>, EpochInsertKeys<TTable>>,
  undefined
> {
  const cols = getTableColumns(table)
  const out: BuildRefine<
    Pick<TableColumns<TTable>, EpochInsertKeys<TTable>>,
    undefined
  > = {}
  for (const [k, col] of Object.entries(cols)) {
    /**
     * skip created_at and updated_at columns since they are non-updateable
     */
    if (col.name === 'created_at' || col.name === 'updated_at') {
      continue
    }
    if (col.getSQLType() === 'timestamptz') {
      // @ts-expect-error - zodPipe not expected to be in refine
      out[k] = col.notNull
        ? zodEpochMs.optional()
        : zodEpochMs.nullish()
    }
  }
  return out
}

function epochRefineForSelect<TTable extends PgTable>(
  table: TTable
): BuildRefine<TableColumns<TTable>, undefined> {
  const cols = getTableColumns(table)
  const out: BuildRefine<TableColumns<TTable>, undefined> = {}
  for (const [k, col] of Object.entries(cols)) {
    if (col.getSQLType() === 'timestamptz') {
      // @ts-expect-error - zodPipe not expected to be in refine
      out[k] = col.notNull
        ? zodEpochMs
        : zodEpochMs.nullable().optional()
    }
  }
  return out
}

// ---------- shared type helpers (module scope) ----------
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
    [K in Extract<keyof BR, string>]: BR[K] extends z.ZodOptional<any>
      ? K
      : never
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
        >]: BR[K] extends z.ZodTypeAny ? InferOutput<BR[K]> : Base[K]
      } & {
        [K in OptionalOverrideKeys<
          Base,
          BR
        >]?: BR[K] extends z.ZodTypeAny ? InferOutput<BR[K]> : Base[K]
      }
    : Base

type ObjShape<TObj> =
  TObj extends z.ZodObject<infer S, infer _C> ? S : never
type WithShape<
  TObj,
  NewShape extends z.ZodRawShape,
> = TObj extends z.ZodObject<infer _S, infer C>
  ? z.ZodObject<NewShape, C>
  : never
type OverrideShapeWithRefine<Base, BR> = BR extends RefineRecord
  ? Omit<Base, KeysToOverride<Base, BR>> & {
      [K in KeysToOverride<Base, BR>]: BR[K] extends z.ZodTypeAny
        ? BR[K]
        : Base[K]
    }
  : Base

// Preserve optional keys from the Base shape when overriding with refine types.
// If the original shape had a key wrapped in ZodOptional, keep it optional in the
// resulting shape even if the refine type is non-optional.
type OverrideShapeWithRefineKeepOptional<Base, BR> =
  BR extends RefineRecord
    ? Omit<Base, KeysToOverride<Base, BR>> & {
        [K in KeysToOverride<Base, BR>]: BR[K] extends z.ZodTypeAny
          ? Base[K] extends z.ZodOptional<any>
            ? z.ZodOptional<BR[K]>
            : BR[K]
          : Base[K]
      }
    : Base

// ---------- client schema builder ----------
export const buildClientSchemas = <
  TSelectRaw extends z.ZodObject<any>,
  TInsertRaw extends z.ZodObject<any>,
  TUpdateRaw extends z.ZodObject<any>,
  SelectOut,
  InsertOut,
  UpdateOut,
  SR extends RefineRecord,
  IR extends RefineRecord,
  UR extends RefineRecord,
  HC extends Partial<Record<string, true>>, // narrowed via Extract with SelectOut/InsertOut/UpdateOut
  ROC extends Partial<Record<string, true>>,
  COC extends Partial<Record<string, true>>,
>(args: {
  selectSchemaRaw: TSelectRaw
  insertSchemaRaw: TInsertRaw
  updateSchemaRaw: TUpdateRaw
  selectRefine: SR
  insertRefine: IR
  updateRefine: UR
  hiddenColumns: HC
  readOnlyColumns: ROC
  createOnlyColumns: COC
  entityName?: string
}) => {
  const {
    selectSchemaRaw,
    insertSchemaRaw,
    updateSchemaRaw,
    selectRefine,
    insertRefine,
    updateRefine,
    entityName,
  } = args

  const hiddenColumns = (args.hiddenColumns ?? {}) as HC
  // Create a shallow copy to avoid mutating the caller's object when adding livemode/organizationId
  const readOnlyColumns = { ...(args.readOnlyColumns ?? {}) } as ROC
  const createOnlyColumns = (args.createOnlyColumns ?? {}) as COC

  const clientSelectBuilt = (
    Object.keys(hiddenColumns).length
      ? (selectSchemaRaw as unknown as z.ZodObject<any>).omit({
          ...hiddenColumns,
          ...hiddenColumnsForClientSchema,
        } as unknown as Partial<
          Record<keyof ObjShape<TSelectRaw>, true>
        >)
      : (selectSchemaRaw as unknown as z.ZodObject<any>).omit(
          hiddenColumnsForClientSchema as unknown as Partial<
            Record<keyof ObjShape<TSelectRaw>, true>
          >
        )
  ).extend(selectRefine as unknown as Partial<ObjShape<TSelectRaw>>)

  type ClientSelectShape = Omit<
    OverrideShapeWithRefine<
      ObjShape<TSelectRaw>,
      typeof selectRefine
    >,
    HiddenKeysOnSelect
  >

  let clientSelect = clientSelectBuilt as unknown as WithShape<
    TSelectRaw,
    ClientSelectShape
  >

  type ExtendedReadOnlyColumns<TExtend extends string> = Partial<
    Record<string | TExtend, true>
  >
  if ('livemode' in (selectSchemaRaw as any).shape) {
    ;(
      readOnlyColumns as ExtendedReadOnlyColumns<'livemode'>
    ).livemode = true
  }
  if ('organizationId' in (selectSchemaRaw as any).shape) {
    ;(
      readOnlyColumns as ExtendedReadOnlyColumns<'organizationId'>
    ).organizationId = true
  }

  let clientInsertBase: z.ZodObject<any>
  const insertOmitMask = clientWriteOmitsConstructor({
    ...hiddenColumns,
    ...readOnlyColumns,
  } as Record<string, true>)
  clientInsertBase = (
    insertSchemaRaw as unknown as z.ZodObject<any>
  ).extend(insertRefine as unknown as Partial<ObjShape<TInsertRaw>>)
  if (Object.keys(insertOmitMask).length) {
    clientInsertBase = clientInsertBase.omit(
      insertOmitMask as unknown as Partial<
        Record<keyof ObjShape<TInsertRaw>, true>
      >
    )
  } else {
    clientInsertBase = clientInsertBase as unknown as z.ZodObject<any>
  }

  const clientInsertBuilt = clientInsertBase

  type ClientInsertShape = Omit<
    OverrideShapeWithRefine<
      ObjShape<TInsertRaw>,
      typeof insertRefine
    >,
    | HiddenKeysOnInsert
    | ReadOnlyKeysOnInsert
    | 'livemode'
    | 'organizationId'
  >
  let clientInsert = clientInsertBuilt as unknown as WithShape<
    TInsertRaw,
    ClientInsertShape
  >

  const updateOmitMask = {
    ...clientWriteOmitsConstructor({
      ...hiddenColumns,
      ...readOnlyColumns,
    } as Record<string, true>),
    ...R.omit(['id'], ommittedColumnsForInsertSchema),
  }
  let clientUpdateBase: z.ZodObject<any> = (
    updateSchemaRaw as unknown as z.ZodObject<any>
  )
    .extend(updateRefine as unknown as Partial<ObjShape<TUpdateRaw>>)
    .extend({
      id: z.string(),
    })

  // Avoid double-omitting keys that are already omitted from the server update schema
  const rawUpdateShape: Record<string, unknown> =
    ((updateSchemaRaw as any).shape ??
      (updateSchemaRaw as any)._def?.shape?.()) ||
    {}
  const filterMaskToExistingKeys = (mask: Record<string, true>) => {
    const filtered: Record<string, true> = {}
    for (const key of Object.keys(mask)) {
      if (key in rawUpdateShape) filtered[key] = true
    }
    return filtered
  }
  const filteredUpdateOmitMask = filterMaskToExistingKeys(
    updateOmitMask as Record<string, true>
  )
  if (Object.keys(filteredUpdateOmitMask).length) {
    clientUpdateBase = clientUpdateBase.omit(
      filteredUpdateOmitMask as unknown as Partial<
        Record<keyof ObjShape<TUpdateRaw>, true>
      >
    )
  } else {
    const defaultMask = filterMaskToExistingKeys(
      ommittedColumnsForInsertSchema as unknown as Record<
        string,
        true
      >
    )
    clientUpdateBase = Object.keys(defaultMask).length
      ? clientUpdateBase.omit(
          defaultMask as unknown as Partial<
            Record<keyof ObjShape<TUpdateRaw>, true>
          >
        )
      : (clientUpdateBase as unknown as z.ZodObject<any>)
  }
  if (Object.keys(createOnlyColumns).length) {
    clientUpdateBase = clientUpdateBase.omit(
      createOnlyColumns as unknown as Partial<
        Record<keyof ObjShape<TUpdateRaw>, true>
      >
    )
  }
  const clientUpdateBuilt = clientUpdateBase
  type ClientUpdateShape = Omit<
    OverrideShapeWithRefine<
      ObjShape<TUpdateRaw>,
      typeof updateRefine
    >,
    | HiddenKeysOnUpdate
    | ReadOnlyKeysOnUpdate
    | CreateOnlyKeysOnUpdate
    | 'livemode'
    | 'organizationId'
  >
  let clientUpdate = clientUpdateBuilt as unknown as WithShape<
    TUpdateRaw,
    ClientUpdateShape
  >

  if (entityName) {
    clientSelect = clientSelect.meta({
      id: `${pascalCase(entityName)}ClientSelectSchema`,
    })
    clientInsert = clientInsert.meta({
      id: `${pascalCase(entityName)}ClientInsertSchema`,
    })
    clientUpdate = clientUpdate.meta({
      id: `${pascalCase(entityName)}ClientUpdateSchema`,
    })
  }

  // Keys actually present on each output type
  type HiddenKeysOnSelect = Extract<keyof HC, keyof SelectOut>
  type HiddenKeysOnInsert = Extract<keyof HC, keyof InsertOut>
  type HiddenKeysOnUpdate = Extract<keyof HC, keyof UpdateOut>

  type ReadOnlyKeysOnInsert = Extract<keyof ROC, keyof InsertOut>
  type ReadOnlyKeysOnUpdate = Extract<keyof ROC, keyof UpdateOut>

  type CreateOnlyKeysOnUpdate = Extract<keyof COC, keyof UpdateOut>

  return {
    select: clientSelect,
    insert: clientInsert,
    update: clientUpdate,
  }
}

// ---------- server schema builder (exported) ----------
export const createServerSchemas = <
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
>(
  table: T,
  params?: {
    discriminator?: D
    insertRefine?: IR
    updateRefine?: UR
    selectRefine?: SR
    refine?: CR
  }
) => {
  const {
    insertRefine: providedInsertRefine,
    updateRefine: providedUpdateRefine,
    selectRefine: providedSelectRefine,
    refine: providedRefine,
  } = params ?? {}

  const insertEpoch = epochRefineForInsert<T>(table)
  const updateEpoch = epochRefineForUpdate<T>(table)
  const selectEpoch = epochRefineForSelect<T>(table)

  type InsertRefineMerged = Omit<CR, keyof IR> &
    IR &
    typeof insertEpoch
  const insertRefine = {
    ...insertEpoch,
    ...(providedRefine ?? ({} as CR)),
    ...(providedInsertRefine ?? ({} as IR)),
  } as const as InsertRefineMerged

  type UpdateRefineMerged = Omit<CR, keyof IR | keyof UR> &
    Omit<IR, keyof UR> &
    UR &
    typeof updateEpoch
  const updateRefine = {
    ...updateEpoch,
    ...(providedRefine ?? ({} as CR)),
    ...(providedInsertRefine ?? ({} as IR)),
    ...(providedUpdateRefine ?? ({} as UR)),
  } as const as UpdateRefineMerged

  const selectRefine = {
    ...selectEpoch,
    ...(providedRefine ?? ({} as CR)),
    ...(providedSelectRefine ?? ({} as SR)),
  } as const as SR & CR & typeof selectEpoch

  const selectSchemaRaw = createSelectSchema(
    table,
    selectRefine as unknown as NoUnknownKeys<
      BuildRefine<TableColumns<T>, undefined>,
      T['$inferSelect']
    >
  )
  type ServerSelectShape = OverrideShapeWithRefine<
    ObjShape<typeof selectSchemaRaw>,
    typeof selectRefine
  >
  const select = selectSchemaRaw as unknown as WithShape<
    typeof selectSchemaRaw,
    ServerSelectShape
  >

  const insertSchemaRaw = createInsertSchema(
    table,
    insertRefine as unknown as NoUnknownKeys<
      BuildRefine<Pick<TableColumns<T>, InsertKeys<T>>, undefined>,
      T['$inferInsert']
    >
  ).omit(ommittedColumnsForInsertSchema)
  type ServerInsertShape = OverrideShapeWithRefine<
    ObjShape<typeof insertSchemaRaw>,
    typeof insertRefine
  >
  const insert = insertSchemaRaw as unknown as WithShape<
    typeof insertSchemaRaw,
    ServerInsertShape
  >

  const baseUpdate = createUpdateSchema(
    table,
    updateRefine as unknown as BuildRefine<
      Pick<TableColumns<T>, InsertKeys<T>>,
      undefined
    >
  )
    .partial()
    // Remove non-updatable timestamp columns from server update schema
    .omit({ createdAt: true, updatedAt: true })

  if (
    params?.discriminator &&
    !(params.discriminator in updateRefine)
  ) {
    throw new Error(
      `Discriminator ${String(
        params.discriminator
      )} not found in updateRefine or base refine. If you specify a discriminator, you must provide an enum value for it in your update or base refine parameters.`
    )
  }

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

  type ServerUpdateShape = OverrideShapeWithRefineKeepOptional<
    ObjShape<typeof updateSchemaRaw>,
    typeof updateRefine
  >
  const updateTyped = updateSchemaRaw as unknown as WithShape<
    typeof updateSchemaRaw,
    ServerUpdateShape
  >

  return {
    select,
    insert,
    update: updateTyped,
    raws: {
      select: selectSchemaRaw,
      insert: insertSchemaRaw,
      update: updateSchemaRaw,
    },
    refines: {
      selectRefine,
      insertRefine,
      updateRefine,
    },
  }
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
  const server = createServerSchemas<T, D, IR, UR, SR, CR>(table, {
    discriminator: params?.discriminator,
    insertRefine: params?.insertRefine as IR,
    updateRefine: params?.updateRefine as UR,
    selectRefine: params?.selectRefine as SR,
    refine: params?.refine as CR,
  })

  type SelectOut = OverrideWithRefineKeepOptional<
    T['$inferSelect'],
    typeof server.refines.selectRefine
  >
  type InsertOut = OverrideWithRefineKeepOptional<
    Omit<
      T['$inferInsert'],
      keyof typeof ommittedColumnsForInsertSchema
    >,
    typeof server.refines.insertRefine
  >
  type UpdateOut = Partial<
    OverrideWithRefineKeepOptional<
      T['$inferInsert'],
      typeof server.refines.updateRefine
    >
  > &
    ({
      id: string
    } & (D extends string
      ? {
          [K in D]: K extends keyof typeof server.refines.updateRefine
            ? (typeof server.refines.updateRefine)[K] extends z.ZodTypeAny
              ? z.infer<(typeof server.refines.updateRefine)[K]>
              : never
            : never
        }
      : {}))

  const selectSchema = server.select as typeof server.select &
    z.ZodType<SelectOut>
  const insertSchema = server.insert as typeof server.insert &
    z.ZodType<InsertOut>
  const updateSchema = server.update as typeof server.update &
    z.ZodType<UpdateOut>

  const hiddenColumns = (params?.client?.hiddenColumns ?? {}) as HC
  const readOnlyColumns = (params?.client?.readOnlyColumns ??
    {}) as ROC
  const createOnlyColumns = (params?.client?.createOnlyColumns ??
    {}) as COC

  const clientSchemas = buildClientSchemas<
    typeof server.raws.select,
    typeof server.raws.insert,
    typeof server.raws.update,
    SelectOut,
    InsertOut,
    UpdateOut,
    typeof server.refines.selectRefine,
    typeof server.refines.insertRefine,
    typeof server.refines.updateRefine,
    HC,
    ROC,
    COC
  >({
    selectSchemaRaw: server.raws.select,
    insertSchemaRaw: server.raws.insert,
    updateSchemaRaw: server.raws.update,
    selectRefine: server.refines.selectRefine,
    insertRefine: server.refines.insertRefine,
    updateRefine: server.refines.updateRefine,
    hiddenColumns,
    readOnlyColumns,
    createOnlyColumns,
    entityName: params?.entityName,
  })

  return {
    select: selectSchema,
    insert: insertSchema,
    update: updateSchema,
    client: clientSchemas,
  }
}
