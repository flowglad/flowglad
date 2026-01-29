// timestamptzMs.ts

import { sql } from 'drizzle-orm'
import { customType } from 'drizzle-orm/pg-core'
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

export const zodEpochMs = z.coerce
  .date()
  .transform((v) => {
    return v instanceof Date
      ? v.getTime()
      : typeof v === 'string'
        ? Date.parse(v)
        : v
  })
  .pipe(z.int())
  .meta({
    description: 'Epoch milliseconds.',
  })
