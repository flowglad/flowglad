// timestamptzMs.ts
import { customType } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { z } from 'zod'

export const TIMESTAMPTZ_MS = Symbol('timestamptzMs')

type EpochBrand = { __brand: typeof TIMESTAMPTZ_MS }

export function timestamptzMs(name: string) {
  const base = customType<{
    data: number
    driverData: Date | string
  }>({
    dataType: () => 'timestamptz',
    toDriver: (n) => new Date(n).toISOString(),
    fromDriver: (v) =>
      v instanceof Date ? v.getTime() : Date.parse(v as string),
  })(name)

  const withDefaultNow = Object.assign(base, {
    defaultNow() {
      return base.notNull().default(sql`now()`)
    },
    __brand: TIMESTAMPTZ_MS,
  })
  // Make the brand visible to the type system:
  return withDefaultNow as typeof withDefaultNow & EpochBrand
}

export const zodEpochMs = z
  .union([z.number(), z.string(), z.date()])
  .transform((v) =>
    v instanceof Date
      ? v.getTime()
      : typeof v === 'string'
        ? Date.parse(v)
        : v
  )
  .pipe(z.number().int())
