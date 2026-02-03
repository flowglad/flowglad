// app/api/health/route.ts
import { log } from '@logtail/next'
import { trace } from '@opentelemetry/api'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { redis } from '@/utils/redis'

export const runtime = 'nodejs' // Ensure Node.js runtime

type ComponentStatus = 'healthy' | 'degraded' | 'unhealthy'

interface ComponentHealth {
  status: ComponentStatus
  latency_ms?: number
  error?: string
}

interface HealthResponse {
  status: ComponentStatus
  timestamp: string
  request_id: string
  trace_id?: string
  components: {
    database: ComponentHealth
    redis: ComponentHealth
  }
}

/**
 * Check database health with a simple query.
 */
async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now()
  try {
    await db.execute(sql`SELECT 1`)
    return {
      status: 'healthy',
      latency_ms: Date.now() - start,
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      latency_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Check Redis health with a simple ping-like operation.
 */
async function checkRedis(): Promise<ComponentHealth> {
  const start = Date.now()
  try {
    const redisClient = redis()
    // Use a simple get operation that returns null for non-existent keys
    await redisClient.get('health:ping')
    return {
      status: 'healthy',
      latency_ms: Date.now() - start,
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      latency_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Determine overall status based on component health.
 * - All healthy → healthy
 * - Any unhealthy → unhealthy (returns 503)
 * - Mix of healthy/degraded → degraded (returns 200)
 */
function aggregateStatus(
  components: Record<string, ComponentHealth>
): ComponentStatus {
  const statuses = Object.values(components).map((c) => c.status)
  if (statuses.includes('unhealthy')) {
    return 'unhealthy'
  }
  if (statuses.includes('degraded')) {
    return 'degraded'
  }
  return 'healthy'
}

export async function GET() {
  const timestamp = new Date().toISOString()
  const requestId = crypto.randomUUID().slice(0, 8)
  const traceId = trace.getActiveSpan()?.spanContext().traceId

  // Run health checks in parallel
  const [database, redisHealth] = await Promise.all([
    checkDatabase(),
    checkRedis(),
  ])

  const components = { database, redis: redisHealth }
  const overallStatus = aggregateStatus(components)

  const response: HealthResponse = {
    status: overallStatus,
    timestamp,
    request_id: requestId,
    ...(traceId && { trace_id: traceId }),
    components,
  }

  // Log health check with component details
  const logLevel = overallStatus === 'healthy' ? 'info' : 'warn'
  log[logLevel]('Health check', {
    service: 'flowglad-api',
    timestamp,
    status: overallStatus,
    request_id: requestId,
    database_status: database.status,
    database_latency_ms: database.latency_ms,
    redis_status: redisHealth.status,
    redis_latency_ms: redisHealth.latency_ms,
    ...(database.error && { database_error: database.error }),
    ...(redisHealth.error && { redis_error: redisHealth.error }),
  })

  // Return 503 if any critical component is unhealthy
  const httpStatus = overallStatus === 'unhealthy' ? 503 : 200

  return NextResponse.json(response, {
    status: httpStatus,
    headers: {
      'X-Request-Id': requestId,
      ...(traceId && { 'X-Trace-Id': traceId }),
    },
  })
}
