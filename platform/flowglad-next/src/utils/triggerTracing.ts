import { SpanKind } from '@opentelemetry/api'
import { withOperationContext } from '@/utils/operationContext'
import { withSpan } from '@/utils/tracing'

/**
 * Wraps a Trigger.dev task dispatch call in a tracing span.
 *
 * Use this to measure the time taken to queue a task.
 * The task execution itself will be traced separately as a root span.
 *
 * @example
 * ```ts
 * await tracedTrigger(
 *   'attemptBillingRun',
 *   () => attemptBillingRunTask.trigger({ billingRunId }),
 *   { 'trigger.billing_run_id': billingRunId }
 * )
 * ```
 */
export const tracedTrigger = async <T>(
  taskName: string,
  triggerFn: () => Promise<T>,
  attributes?: Record<string, string | number | boolean | undefined>
): Promise<T> => {
  return withSpan(
    {
      spanName: `trigger.dispatch.${taskName}`,
      tracerName: 'trigger',
      kind: SpanKind.PRODUCER,
      attributes: {
        'trigger.task_name': taskName,
        ...attributes,
      },
    },
    triggerFn
  )
}

/**
 * Wraps a Trigger.dev task's run function in a tracing span.
 *
 * Use this inside task handlers to create a root span for the task execution.
 * This allows you to add child spans for operations within the task.
 *
 * @example
 * ```ts
 * export const myTask = task({
 *   id: 'my-task',
 *   run: async (payload) => {
 *     return tracedTaskRun('my-task', async () => {
 *       // Task implementation with nested spans
 *     }, { 'trigger.some_id': payload.someId })
 *   },
 * })
 * ```
 */
export const tracedTaskRun = async <T>(
  taskName: string,
  runFn: () => Promise<T>,
  attributes?: Record<string, string | number | boolean | undefined>
): Promise<T> => {
  // Set operation context so database queries within this task are labeled
  const operationName = `trigger.${taskName}`
  return withOperationContext(operationName, () =>
    withSpan(
      {
        spanName: `trigger.run.${taskName}`,
        tracerName: 'trigger',
        kind: SpanKind.INTERNAL,
        attributes: {
          'trigger.task_name': taskName,
          ...attributes,
        },
      },
      runFn
    )
  )
}
