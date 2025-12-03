import { logger, task } from '@trigger.dev/sdk'
import {
  type Customer,
  customersSelectSchema,
} from '@/db/schema/customers'
import { supabaseInsertPayloadSchema } from '@/db/supabase'
import type { SupabaseInsertPayload } from '@/types'

const customerInsertPayloadSchema = supabaseInsertPayloadSchema(
  customersSelectSchema
)

export const customerCreatedTask = task({
  id: 'customer-inserted',
  run: async (
    payload: SupabaseInsertPayload<Customer.Record>,
    { ctx }
  ) => {
    const parsedPayload =
      customerInsertPayloadSchema.safeParse(payload)
    if (!parsedPayload.success) {
      logger.error(parsedPayload.error.message)
      parsedPayload.error.issues.forEach((issue) => {
        logger.error(`${issue.path.join('.')}: ${issue.message}`)
      })
      throw new Error('Invalid payload')
    }

    const { record } = parsedPayload.data
    return {
      message: 'OK',
    }
  },
})
