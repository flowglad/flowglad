import { SupabasePayloadType } from '@db-core/enums'
import { z } from 'zod'
import { SupabaseInsertPayload, SupabaseUpdatePayload } from '@/types'
import core from '@/utils/core'

export const supabasePayloadBaseSchema = z.object({
  table: z.string(),
  schema: z.string(),
  type: core.createSafeZodEnum(SupabasePayloadType),
  record: z.object({}),
})

export const supabaseInsertPayloadSchema = <T extends z.ZodTypeAny>(
  recordSchema: T
) =>
  supabasePayloadBaseSchema.extend({
    type: z.literal('INSERT'),
    record: recordSchema,
  })

export const supabaseUpdatePayloadSchema = <T extends z.ZodTypeAny>(
  recordSchema: T
) =>
  supabasePayloadBaseSchema.extend({
    type: z.literal('UPDATE'),
    record: recordSchema,
    old_record: recordSchema,
  })
