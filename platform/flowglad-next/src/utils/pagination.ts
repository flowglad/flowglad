import { z } from 'zod'

// Enforce single-value semantics for pagination params. Duplicate values are rejected.
const singleOrError = (paramName: string) => (v: unknown) => {
  if (Array.isArray(v)) {
    throw new Error(`Multiple '${paramName}' values are not allowed`)
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
  direction: z
    .preprocess(
      singleOrError('direction'),
      z.enum(['forward', 'backward'])
    )
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
    throw new Error('Invalid cursor')
  }
}
