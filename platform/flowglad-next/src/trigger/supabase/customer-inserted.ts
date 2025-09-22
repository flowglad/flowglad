import { logger, task } from '@trigger.dev/sdk'
import { SupabaseInsertPayload } from '@/types'
import { supabaseInsertPayloadSchema } from '@/db/supabase'
import {
  Customer,
  customersSelectSchema,
} from '@/db/schema/customers'

const customerInsertPayloadSchema = supabaseInsertPayloadSchema(
  customersSelectSchema
)

export const customerCreatedTask = task({
  id: 'customer-inserted',
  run: async (
    payload: SupabaseInsertPayload<Customer.Record>,
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

    const { } = parsedPayload.data
    return {
      message: 'OK',
    }
  },
})
