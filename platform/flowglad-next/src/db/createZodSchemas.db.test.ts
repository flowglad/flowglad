import { describe, expect, it } from 'bun:test'
import { buildSchemas } from '@db-core/createZodSchemas'
import { TaxType } from '@db-core/enums'
import { pgEnumColumn, tableBase } from '@db-core/tableUtils'
import { timestamptzMs } from '@db-core/timestampMs'
import { pgTable, text } from 'drizzle-orm/pg-core'
import { z } from 'zod'

/**
 * Test table: includes
 * - base columns (id, createdAt, updatedAt, livemode, position, commits)
 * - two timestamptz: required and nullable
 * - a text enum via pgEnumColumn
 * - organizationId to test auto read-only masking behavior
 * - status: a free-text field to test refine priority overrides
 */
const testTable = pgTable('zod_schema_test', {
  ...tableBase('zst'),
  organizationId: text('organization_id').notNull(),
  eventAt: timestamptzMs('event_at').notNull(),
  optionalHappenedAt: timestamptzMs('optional_happened_at'), // nullable/optional
  taxType: pgEnumColumn({
    enumName: 'TaxType',
    columnName: 'tax_type',
    enumBase: TaxType,
  }),
  status: text('status').notNull(),
})

// Shared refines for priority tests
const baseRefine = {
  status: z.enum(['base']),
}
const insertRefine = {
  status: z.enum(['insert']),
}
const updateRefine = {
  status: z.enum(['update']),
}
const selectRefine = {
  status: z.enum(['select']),
}

// For discriminator tests
const discriminatorEnum = z.enum(['A', 'B', 'C'])

describe('createZodSchemas/buildSchemas - server schemas', () => {
  it('excludes createdAt and updatedAt from insert schema', () => {
    const { insert } = buildSchemas(testTable)
    const shape =
      (insert as any).shape ?? (insert as any)._def.shape()
    expect('createdAt' in shape).toBe(false)
    expect('updatedAt' in shape).toBe(false)
  })

  it('excludes createdAt and updatedAt from update schema', () => {
    const { update } = buildSchemas(testTable)
    const shape =
      (update as any).shape ?? (update as any)._def.shape()
    expect('createdAt' in shape).toBe(false)
    expect('updatedAt' in shape).toBe(false)
  })

  it('sets zodEpochMs for all timestamptz columns with correct optional/nullable shapes', () => {
    const { select, insert, update } = buildSchemas(testTable)
    const selectShape =
      (select as any).shape ?? (select as any)._def.shape()
    const insertShape =
      (insert as any).shape ?? (insert as any)._def.shape()
    const updateShape =
      (update as any).shape ?? (update as any)._def.shape()

    // eventAt: required on select/insert; optional on update
    expect(selectShape.eventAt).toHaveProperty('parse')
    expect(insertShape.eventAt).toHaveProperty('parse')
    expect(updateShape.eventAt).toHaveProperty('parse')

    // Parse acceptance for epoch/date/string
    const date = new Date('2020-01-01T00:00:00.000Z')
    expect(insertShape.eventAt.parse(date)).toBe(date.getTime())
    expect(insertShape.eventAt.parse(date.toISOString())).toBe(
      date.getTime()
    )
    expect(insertShape.eventAt.parse(date.getTime())).toBe(
      date.getTime()
    )

    // optionalHappenedAt: nullable/optional on select/insert; optional on update
    expect(selectShape.optionalHappenedAt).toHaveProperty('safeParse')
    // select accepts undefined and null
    expect(
      selectShape.optionalHappenedAt.safeParse(undefined).success
    ).toBe(true)
    expect(
      selectShape.optionalHappenedAt.safeParse(null).success
    ).toBe(true)

    // insert accepts undefined and null
    expect(
      insertShape.optionalHappenedAt.safeParse(undefined).success
    ).toBe(true)
    expect(
      insertShape.optionalHappenedAt.safeParse(null).success
    ).toBe(true)

    // update accepts undefined (optional)
    expect(
      updateShape.optionalHappenedAt.safeParse(undefined).success
    ).toBe(true)

    // invalid string should fail
    expect(insertShape.eventAt.safeParse('not-a-date').success).toBe(
      false
    )
  })

  it('honors refine priority: selectEpoch < refine < selectRefine', () => {
    const { select } = buildSchemas(testTable, {
      refine: baseRefine,
      selectRefine,
    })
    const shape =
      (select as any).shape ?? (select as any)._def.shape()
    const status = shape.status
    expect(status.safeParse('select').success).toBe(true)
    expect(status.safeParse('base').success).toBe(false)
  })

  it('honors refine priority: insertEpoch < refine < insertRefine', () => {
    const { insert } = buildSchemas(testTable, {
      refine: baseRefine,
      insertRefine,
    })
    const shape =
      (insert as any).shape ?? (insert as any)._def.shape()
    const status = shape.status
    expect(status.safeParse('insert').success).toBe(true)
    expect(status.safeParse('base').success).toBe(false)
  })

  it('honors refine priority: updateEpoch < refine < insertRefine < updateRefine', () => {
    const { update } = buildSchemas(testTable, {
      refine: baseRefine,
      insertRefine,
      updateRefine,
    })
    const shape =
      (update as any).shape ?? (update as any)._def.shape()
    const status = shape.status
    expect(status.safeParse('update').success).toBe(true)
    expect(status.safeParse('insert').success).toBe(false)
    expect(status.safeParse('base').success).toBe(false)
  })

  it('enum refinements flow through and reject non-enum strings', () => {
    const taxEnum = z.enum(
      Object.values(TaxType) as [string, ...string[]]
    )
    const { select, insert, update } = buildSchemas(testTable, {
      refine: { taxType: taxEnum },
    })
    const s = (select as any).shape ?? (select as any)._def.shape()
    const i = (insert as any).shape ?? (insert as any)._def.shape()
    const u = (update as any).shape ?? (update as any)._def.shape()
    expect(s.taxType.safeParse('not-an-enum').success).toBe(false)
    expect(i.taxType.safeParse('not-an-enum').success).toBe(false)
    expect(u.taxType.safeParse('not-an-enum').success).toBe(false)
    // valid example
    expect(s.taxType.safeParse(TaxType.GST).success).toBe(true)
  })

  it('requires discriminator field in update when discriminator is provided', () => {
    const { update } = buildSchemas(testTable, {
      discriminator: 'status',
      updateRefine: { status: discriminatorEnum },
    })
    const shape =
      (update as any).shape ?? (update as any)._def.shape()
    expect('id' in shape).toBe(true)
    expect('status' in shape).toBe(true)
    // status should accept only discriminator enum values
    expect(shape.status.safeParse('A').success).toBe(true)
    expect(shape.status.safeParse('Z').success).toBe(false)
  })

  it('throws when discriminator is specified but missing from update/base refine', () => {
    expect(() =>
      // @ts-expect-error  - test
      buildSchemas(testTable, { discriminator: 'status' as any })
    ).toThrow(/Discriminator .* not found/i)
  })
})

describe('buildClientSchemas via buildSchemas(...).client - client schemas', () => {
  it('excludes hidden columns in client select/insert/update', () => {
    // Use an actually present column for custom-hidden masking
    const { client } = buildSchemas(testTable, {
      client: { hiddenColumns: { status: true } as any },
    })
    const s =
      (client.select as any).shape ??
      (client.select as any)._def.shape()
    const i =
      (client.insert as any).shape ??
      (client.insert as any)._def.shape()
    const u =
      (client.update as any).shape ??
      (client.update as any)._def.shape()
    // custom hidden
    expect('status' in s).toBe(false)
    expect('status' in i).toBe(false)
    expect('status' in u).toBe(false)
    // default hidden
    for (const key of [
      'createdByCommit',
      'updatedByCommit',
      'position',
    ]) {
      expect(key in s).toBe(false)
      expect(key in i).toBe(false)
      expect(key in u).toBe(false)
    }
  })

  it('read-only columns appear only in client select', () => {
    /**
     * Test plain case
     */
    const { client } = buildSchemas(testTable, {
      client: { readOnlyColumns: { status: true } as any },
    })
    const s =
      (client.select as any).shape ??
      (client.select as any)._def.shape()
    const i =
      (client.insert as any).shape ??
      (client.insert as any)._def.shape()
    const u =
      (client.update as any).shape ??
      (client.update as any)._def.shape()
    expect('status' in s).toBe(true)
    expect('status' in i).toBe(false)
    expect('status' in u).toBe(false)
    /**
     * Test read-only columns override refine priority
     */
    const { client: client2 } = buildSchemas(testTable, {
      refine: { status: z.enum(['base']) },
      client: { readOnlyColumns: { status: true } as any },
    })
    const s2 =
      (client2.select as any).shape ??
      (client2.select as any)._def.shape()
    const i2 =
      (client2.insert as any).shape ??
      (client2.insert as any)._def.shape()
    const u2 =
      (client2.update as any).shape ??
      (client2.update as any)._def.shape()
    expect('status' in s2).toBe(true)
    expect('status' in i2).toBe(false)
    expect('status' in u2).toBe(false)
  })

  it('livemode and organizationId are auto read-only (present in select, omitted in insert/update)', () => {
    const { client } = buildSchemas(testTable)
    const s =
      (client.select as any).shape ??
      (client.select as any)._def.shape()
    const i =
      (client.insert as any).shape ??
      (client.insert as any)._def.shape()
    const u =
      (client.update as any).shape ??
      (client.update as any)._def.shape()
    for (const key of ['livemode', 'organizationId']) {
      expect(key in s).toBe(true)
      expect(key in i).toBe(false)
      expect(key in u).toBe(false)
    }
  })

  it('createdAt and updatedAt are never present in client insert/update', () => {
    const { client } = buildSchemas(testTable)
    const i =
      (client.insert as any).shape ??
      (client.insert as any)._def.shape()
    const u =
      (client.update as any).shape ??
      (client.update as any)._def.shape()
    for (const key of ['createdAt', 'updatedAt']) {
      expect(key in i).toBe(false)
      expect(key in u).toBe(false)
    }
  })

  it('createOnlyColumns are excluded from client update only', () => {
    const { client } = buildSchemas(testTable, {
      client: { createOnlyColumns: { status: true } as any },
    })
    const i =
      (client.insert as any).shape ??
      (client.insert as any)._def.shape()
    const u =
      (client.update as any).shape ??
      (client.update as any)._def.shape()
    expect('status' in i).toBe(true)
    expect('status' in u).toBe(false)
  })

  it('client schemas honor timestamptz epoch parsing and optionality consistent with server', () => {
    const { client } = buildSchemas(testTable)
    const s =
      (client.select as any).shape ??
      (client.select as any)._def.shape()
    const i =
      (client.insert as any).shape ??
      (client.insert as any)._def.shape()
    const u =
      (client.update as any).shape ??
      (client.update as any)._def.shape()
    const date = new Date('2022-02-02T02:02:02.000Z')
    // eventAt required on select/insert; optional on update
    expect(i.eventAt.parse(date)).toBe(date.getTime())
    expect(s.eventAt.parse(date.toISOString())).toBe(date.getTime())
    expect(u.eventAt.safeParse(undefined).success).toBe(true)
    // optionalHappenedAt nullable/optional for select/insert
    expect(s.optionalHappenedAt.safeParse(null).success).toBe(true)
    expect(i.optionalHappenedAt.safeParse(undefined).success).toBe(
      true
    )
  })

  it('client schemas reflect final refine priority outcomes', () => {
    const { client } = buildSchemas(testTable, {
      refine: baseRefine,
      insertRefine,
      updateRefine,
      selectRefine,
    })
    const s =
      (client.select as any).shape ??
      (client.select as any)._def.shape()
    const i =
      (client.insert as any).shape ??
      (client.insert as any)._def.shape()
    const u =
      (client.update as any).shape ??
      (client.update as any)._def.shape()
    expect(s.status.safeParse('select').success).toBe(true)
    expect(s.status.safeParse('base').success).toBe(false)
    expect(i.status.safeParse('insert').success).toBe(true)
    expect(i.status.safeParse('base').success).toBe(false)
    expect(u.status.safeParse('update').success).toBe(true)
    expect(u.status.safeParse('insert').success).toBe(false)
  })
})
