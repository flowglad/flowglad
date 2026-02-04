import { z } from 'zod'
import { panic } from '@/errors'

// Enforce single-value semantics for pagination params. Duplicate values are rejected.
const singleOrError = (paramName: string) => (v: unknown) => {
  if (Array.isArray(v)) {
    panic(`Multiple '${paramName}' values are not allowed`)
  }
  return v
}

export const paginationParamsSchema = z.object({
  limit: z
    .preprocess(
      singleOrError('limit'),
      z.coerce.number().int().min(1).max(100)
    )
    .optional(),
  cursor: z
    .preprocess(singleOrError('cursor'), z.string().min(1))
    .optional(),
})

export type PaginationParams = z.infer<typeof paginationParamsSchema>

export const parsePaginationParams = (
  qp: Record<string, string | string[]>
): PaginationParams => paginationParamsSchema.parse(qp)

// Cursor validation (opaque string → base64 JSON with required id)
const cursorPayloadSchema = z.object({
  parameters: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.number().optional(),
  id: z.string().min(1),
  direction: z.enum(['forward', 'backward']).optional(),
})

export type CursorPayload = z.infer<typeof cursorPayloadSchema>

export const parseAndValidateCursor = (
  cursor: string
): CursorPayload => {
  try {
    const raw = Buffer.from(cursor, 'base64').toString()
    const decoded = JSON.parse(raw)
    return cursorPayloadSchema.parse(decoded)
  } catch (err) {
    panic('Invalid cursor')
  }
}

const legacyCursorPayloadSchema = z
  .object({
    parameters: z.record(z.string(), z.unknown()).optional(),
    createdAt: z.number(),
    direction: z.enum(['forward', 'backward']),
  })
  .strict()

export type LegacyCursorPayload = z.infer<
  typeof legacyCursorPayloadSchema
>

export const parseAndValidateLegacyCursor = (
  cursor: string
): LegacyCursorPayload => {
  try {
    const raw = Buffer.from(cursor, 'base64').toString()
    const decoded = JSON.parse(raw)
    return legacyCursorPayloadSchema.parse(decoded)
  } catch (err) {
    panic('Invalid legacy cursor')
  }
}
