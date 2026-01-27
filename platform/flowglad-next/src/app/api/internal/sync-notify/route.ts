import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import core from '@/utils/core'
import { logger } from '@/utils/logger'
import { getSyncStreamInfo } from '@/utils/syncStream'
import {
  createSyncWebhookPayload,
  pushSyncNotification,
  type WebhookConfig,
} from '@/utils/syncWebhook'

/**
 * Request body schema for sync notification trigger.
 */
const requestSchema = z.object({
  /** Scope ID to send notification for */
  scopeId: z.string().min(1),
  /** Webhook endpoint URL */
  webhookUrl: z.string().url(),
  /** Webhook signing secret */
  webhookSecret: z.string().min(1),
})

/**
 * Environment variable key for internal API authentication.
 * This endpoint is internal-only and requires a bearer token.
 */
const INTERNAL_API_TOKEN_KEY = 'INTERNAL_API_TOKEN'

/**
 * Verify the request has a valid internal API token.
 */
const verifyInternalAuth = (request: NextRequest): boolean => {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return false
  }

  return core.authorizationHeaderTokenMatchesEnvToken({
    headerValue: authHeader,
    tokenEnvVariableKey: INTERNAL_API_TOKEN_KEY,
  })
}

/**
 * POST /api/internal/sync-notify
 *
 * Internal endpoint to trigger a webhook notification for sync events.
 * This is called by the platform when new sync events are written to a stream.
 *
 * Request body:
 * - scopeId: The scope ID to notify about
 * - webhookUrl: The merchant's webhook endpoint
 * - webhookSecret: The signing secret for this endpoint
 *
 * Authentication:
 * - Requires Authorization: Bearer <INTERNAL_API_TOKEN>
 *
 * Response:
 * - 200: Notification sent successfully
 * - 400: Invalid request body
 * - 401: Missing or invalid authentication
 * - 500: Internal error
 */
export const POST = async (request: NextRequest) => {
  // Verify internal authentication
  if (!verifyInternalAuth(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    // Parse and validate request body
    const body = await request.json()
    const parseResult = requestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: parseResult.error.issues,
        },
        { status: 400 }
      )
    }

    const { scopeId, webhookUrl, webhookSecret } = parseResult.data

    // Get current stream info
    const streamInfo = await getSyncStreamInfo(scopeId)

    // If stream is empty or doesn't exist, nothing to notify about
    if (streamInfo.length === 0 || !streamInfo.lastEntry) {
      return NextResponse.json({
        success: true,
        message: 'No events in stream',
        eventCount: 0,
      })
    }

    // Create webhook payload
    const payload = createSyncWebhookPayload({
      scopeId,
      latestSequence: streamInfo.lastEntry,
      eventCount: streamInfo.length,
    })

    // Configure webhook delivery
    const config: WebhookConfig = {
      url: webhookUrl,
      secret: webhookSecret,
    }

    // Send the notification
    const result = await pushSyncNotification(config, payload)

    if (result.success) {
      return NextResponse.json({
        success: true,
        statusCode: result.statusCode,
        attempts: result.attempts,
        eventCount: streamInfo.length,
        latestSequence: streamInfo.lastEntry,
      })
    } else {
      // Delivery failed after retries
      logger.warn('Sync notification delivery failed', {
        scopeId,
        webhookUrl,
        error: result.error,
        attempts: result.attempts,
        statusCode: result.statusCode,
      })

      return NextResponse.json(
        {
          success: false,
          error: result.error,
          attempts: result.attempts,
          statusCode: result.statusCode,
        },
        { status: 502 } // Bad Gateway - upstream failure
      )
    }
  } catch (error) {
    logger.error('Error in sync-notify endpoint', {
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/internal/sync-notify
 *
 * Health check endpoint.
 */
export const GET = async () => {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/internal/sync-notify',
  })
}
