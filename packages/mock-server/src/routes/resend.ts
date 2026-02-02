import { delay, parseErrorConfig } from '../utils/errors'
import { generateId } from '../utils/ids'

/**
 * Resend Email API Mock
 *
 * Handles Resend email API requests. This is a stateless mock that
 * always returns success for email operations.
 *
 * Supports error simulation via headers:
 * - X-Mock-Error: true | <status-code> | timeout
 * - X-Mock-Error-Message: <custom message>
 */

interface ResendEmailResponse {
  id: string
}

interface ResendErrorResponse {
  statusCode: number
  message: string
  name: string
}

/**
 * Create a JSON response
 */
function jsonResponse(
  data: ResendEmailResponse | ResendErrorResponse,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

/**
 * Generate a Resend-style email ID
 */
function generateEmailId(): string {
  return generateId('')
}

/**
 * Handler for POST /emails
 * Send an email
 */
export function handleSendEmail(): Response {
  return jsonResponse({
    id: generateEmailId(),
  })
}

/**
 * Handler for POST /emails/batch
 * Send batch emails
 */
export async function handleSendBatchEmails(
  req: Request
): Promise<Response> {
  try {
    const body = await req.json()
    const emails = Array.isArray(body) ? body : []
    const ids = emails.map(() => ({ id: generateEmailId() }))
    return jsonResponse({
      data: ids,
    } as unknown as ResendEmailResponse)
  } catch {
    return jsonResponse({
      id: generateEmailId(),
    })
  }
}

/**
 * Route handler for Resend mock server.
 * Returns a Response if the route matches, null otherwise.
 *
 * Supports error simulation via headers:
 * - X-Mock-Error: true | <status-code> | timeout
 * - X-Mock-Error-Message: <custom message>
 */
export async function handleResendRoute(
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
      await delay(5000)
    }
    return jsonResponse(
      {
        statusCode: errorConfig.statusCode,
        message: errorConfig.message,
        name: 'Error',
      },
      errorConfig.statusCode
    )
  }

  switch (pathname) {
    case '/emails':
      return handleSendEmail()
    case '/emails/batch':
      return handleSendBatchEmails(req)
    default:
      return null
  }
}
