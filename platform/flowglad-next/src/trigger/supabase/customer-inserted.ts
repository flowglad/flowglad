import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import type { z } from 'zod'
import {
  type Customer,
  customersSelectSchema,
} from '@/db/schema/customers'
import { supabaseInsertPayloadSchema } from '@/db/supabase'
import { ValidationError } from '@/errors'
import type { SupabaseInsertPayload } from '@/types'

const customerInsertPayloadSchema = supabaseInsertPayloadSchema(
  customersSelectSchema
)

type CustomerInsertPayload = z.infer<
  typeof customerInsertPayloadSchema
>

export function validateCustomerInsertPayload(
  payload: SupabaseInsertPayload<Customer.Record>
): Result<CustomerInsertPayload, ValidationError> {
  const parsedPayload = customerInsertPayloadSchema.safeParse(payload)
  if (!parsedPayload.success) {
    logger.error(parsedPayload.error.message)
    parsedPayload.error.issues.forEach((issue) => {
      logger.error(`${issue.path.join('.')}: ${issue.message}`)
    })
    return Result.err(
      new ValidationError('payload', 'Invalid payload')
    )
  }
  return Result.ok(parsedPayload.data)
}

export const customerCreatedTask = task({
  id: 'customer-inserted',
  run: async (
    payload: SupabaseInsertPayload<Customer.Record>,
    { ctx }
  ) => {
    const validatedPayload =
      validateCustomerInsertPayload(payload).unwrap()

    const { record } = validatedPayload
    return {
      message: 'OK',
    }
  },
})
