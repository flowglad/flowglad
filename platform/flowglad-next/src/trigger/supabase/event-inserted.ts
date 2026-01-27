import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import type { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { type Event, eventsSelectSchema } from '@/db/schema/events'
import { supabaseInsertPayloadSchema } from '@/db/supabase'
import {
  selectEventById,
  updateEvent,
} from '@/db/tableMethods/eventMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { ValidationError } from '@/errors'
import type { SupabaseInsertPayload } from '@/types'
import { keysToCamelCase } from '@/utils/core'
import { storeTelemetry } from '@/utils/redis'
import { sendSvixEvent } from '@/utils/svix'

const eventInsertSchema = supabaseInsertPayloadSchema(
  eventsSelectSchema
)

type EventInsertPayload = z.infer<typeof eventInsertSchema>

export function validateEventInsertPayload(
  payload: SupabaseInsertPayload<Event.Record>
): Result<EventInsertPayload, ValidationError> {
  /**
   *  Transform the record to camelCase and convert date strings to Date objects
   */
  const recordSnake = payload.record as Record<string, unknown>
  const transformedRecord = {
    ...keysToCamelCase(payload.record),
    /**
     * Must transform dates to Date objects to pass zod validation
     */
    createdAt: recordSnake.created_at
      ? new Date(recordSnake.created_at as string)
      : undefined,
    updatedAt: recordSnake.updated_at
      ? new Date(recordSnake.updated_at as string)
      : undefined,
    occurredAt: recordSnake.occurred_at
      ? new Date(recordSnake.occurred_at as string)
      : undefined,
    submittedAt: recordSnake.submitted_at
      ? new Date(recordSnake.submitted_at as string)
      : undefined,
    processedAt: recordSnake.processed_at
      ? new Date(recordSnake.processed_at as string)
      : null,
  }

  const parsedPayload = eventInsertSchema.safeParse({
    table: payload.table,
    schema: payload.schema,
    type: payload.type,
    record: transformedRecord,
  })

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

export const eventInsertedTask = task({
  id: 'event-inserted',
  run: async (
    payload: SupabaseInsertPayload<Event.Record>,
    { ctx }
  ) => {
    const validatedPayload =
      validateEventInsertPayload(payload).unwrap()
    const { record: event } = validatedPayload

    const {
      result,
      organization,
      event: mostUpToDateEvent,
    } = await adminTransaction(async ({ transaction }) => {
      const existingEventResult = await selectEventById(
        event.id,
        transaction
      )
      const existingEvent = Result.isOk(existingEventResult)
        ? existingEventResult.unwrap()
        : null

      if (existingEvent?.processedAt) {
        return {
          eventId: event.id,
          result: 'already_processed',
        }
      }

      const updatedEvent = await updateEvent(
        { id: event.id, processedAt: Date.now() },
        transaction
      )
      const organization = (
        await selectOrganizationById(
          event.organizationId,
          transaction
        )
      ).unwrap()
      return {
        eventId: event.id,
        result: 'processed',
        organization,
        event: updatedEvent,
      }
    })
    if (result === 'already_processed') {
      return result
    }
    if (mostUpToDateEvent) {
      await sendSvixEvent({
        event: mostUpToDateEvent,
        organization,
      })

      await storeTelemetry(
        'webhook',
        mostUpToDateEvent.id,
        ctx.run.id
      )
    }
    return result
  },
})
