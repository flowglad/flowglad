import {
  createErrorResponse,
  delay,
  parseErrorConfig,
} from '../utils/errors'
import { generateId } from '../utils/ids'

/**
 * Response shape for a triggered task.
 */
export interface TriggerTaskResponse {
  id: string
  status: 'QUEUED'
}

/**
 * Generate a Trigger.dev-style handle ID (prefixed with "handle_")
 */
export function generateTriggerHandleId(): string {
  return generateId('handle_')
}

/**
 * Handle POST /api/v1/tasks/:taskId/trigger
 * Triggers a task and returns a handle ID with QUEUED status.
 *
 * @param _taskId - The task ID from the URL path (unused in stateless mock)
 * @returns Response with handle ID and QUEUED status
 */
export function handleTriggerTask(_taskId: string): Response {
  const response: TriggerTaskResponse = {
    id: generateTriggerHandleId(),
    status: 'QUEUED',
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

/**
 * Parse the task ID from a trigger endpoint path.
 * Expected format: /api/v1/tasks/:taskId/trigger
 *
 * @param pathname - The URL pathname
 * @returns The task ID if the path matches, null otherwise
 */
export function parseTriggerPath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/v1\/tasks\/([^/]+)\/trigger$/)
  return match ? match[1] : null
}

/**
 * Route handler for Trigger.dev mock server.
 * Returns a Response if the route matches, null otherwise.
 *
 * Supports error simulation via headers:
 * - X-Mock-Error: true | <status-code> | timeout
 * - X-Mock-Error-Message: <custom message>
 */
export async function handleTriggerRoute(
  req: Request,
  pathname: string
): Promise<Response | null> {
  if (req.method !== 'POST') {
    return null
  }

  // Check for error simulation
  const errorConfig = parseErrorConfig(req)
  if (errorConfig) {
    if (errorConfig.isTimeout) {
      await delay(5000) // 5 second delay for timeout simulation
    }
    return createErrorResponse('trigger', errorConfig)
  }

  const taskId = parseTriggerPath(pathname)
  if (taskId) {
    return handleTriggerTask(taskId)
  }

  return null
}
