import { z } from 'zod'
import {
  SupabaseInsertPayload,
  SupabasePayloadType,
  SupabaseUpdatePayload,
} from '@/types'
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
  }) as z.ZodType<SupabaseInsertPayload<z.infer<T>>>

export const supabaseUpdatePayloadSchema = <T extends z.ZodTypeAny>(
  recordSchema: T
) =>
  supabasePayloadBaseSchema.extend({
    type: z.literal('UPDATE'),
    record: recordSchema,
    old_record: recordSchema,
  }) as z.ZodType<SupabaseUpdatePayload<z.infer<T>>>
