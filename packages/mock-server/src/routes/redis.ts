import { delay, parseErrorConfig } from '../utils/errors'

/**
 * Upstash Redis REST API Mock
 *
 * Handles Redis commands sent via the Upstash REST API format.
 * Commands are sent as POST requests with an array body: ["GET", "key"]
 *
 * This is a stateless mock - it returns success for write operations
 * and null for read operations (simulating cache miss).
 *
 * Supports error simulation via headers:
 * - X-Mock-Error: true | <status-code> | timeout
 * - X-Mock-Error-Message: <custom message>
 */

type RedisCommand = string[]

interface RedisSuccessResponse {
  result: unknown
}

interface RedisErrorResponse {
  error: string
}

/**
 * Create a JSON response
 */
function jsonResponse(
  data: RedisSuccessResponse | RedisErrorResponse,
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
 * Handle a Redis command and return the appropriate response.
 * This is stateless - writes succeed, reads return null.
 */
function handleRedisCommand(
  command: RedisCommand
): RedisSuccessResponse {
  const [cmd] = command
  const upperCmd = cmd?.toUpperCase()

  switch (upperCmd) {
    // Single-value read commands - return null (cache miss)
    case 'GET':
    case 'HGET':
      return { result: null }

    // Collection read commands - return empty arrays (Redis returns [] when key doesn't exist)
    case 'HGETALL':
    case 'LRANGE':
    case 'SMEMBERS':
    case 'ZRANGE':
      return { result: [] }

    // MGET returns array of nulls (one per key requested)
    case 'MGET':
      // Return array of nulls matching the number of keys requested
      const keyCount = command.length - 1 // command[0] is 'MGET', rest are keys
      return { result: Array(keyCount).fill(null) }

    // Write commands - return OK or count
    case 'SET':
    case 'SETEX':
    case 'PSETEX':
    case 'SETNX':
    case 'HSET':
    case 'HMSET':
    case 'LPUSH':
    case 'RPUSH':
    case 'SADD':
    case 'ZADD':
      return { result: 'OK' }

    // Delete commands - return count of deleted keys (1)
    case 'DEL':
    case 'HDEL':
    case 'LREM':
    case 'SREM':
    case 'ZREM':
      return { result: 1 }

    // Increment commands - return new value
    case 'INCR':
    case 'INCRBY':
    case 'HINCRBY':
      return { result: 1 }

    // Expire commands - return 1 (success)
    case 'EXPIRE':
    case 'PEXPIRE':
    case 'EXPIREAT':
    case 'PEXPIREAT':
      return { result: 1 }

    // TTL commands - return -2 (key doesn't exist, consistent with null GET)
    case 'TTL':
    case 'PTTL':
      return { result: -2 }

    // Exists - return 0 (key doesn't exist)
    case 'EXISTS':
      return { result: 0 }

    // Keys/Scan - return empty array
    case 'KEYS':
    case 'SCAN':
      return { result: [] }

    // Ping - return PONG
    case 'PING':
      return { result: 'PONG' }

    // Default - return OK for unknown commands
    default:
      return { result: 'OK' }
  }
}

/**
 * Parse the request body to extract Redis command(s).
 * Upstash sends commands as JSON arrays.
 */
async function parseRedisCommand(
  req: Request
): Promise<RedisCommand | RedisCommand[] | null> {
  try {
    const body = await req.json()
    // Can be a single command array or array of command arrays (pipeline)
    if (Array.isArray(body) && body.length > 0) {
      // Pipeline: array of arrays where each inner array contains strings
      if (
        Array.isArray(body[0]) &&
        body.every(
          (cmd) =>
            Array.isArray(cmd) &&
            cmd.every((arg) => typeof arg === 'string')
        )
      ) {
        return body as RedisCommand[]
      }
      // Single command: array of strings
      if (body.every((item) => typeof item === 'string')) {
        return body as RedisCommand
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Check if the body is a pipeline (array of arrays)
 */
function isPipeline(
  command: RedisCommand | RedisCommand[]
): command is RedisCommand[] {
  return Array.isArray(command[0])
}

/**
 * Route handler for Redis mock server.
 * Returns a Response if the route matches, null otherwise.
 *
 * Supports error simulation via headers:
 * - X-Mock-Error: true | <status-code> | timeout
 * - X-Mock-Error-Message: <custom message>
 */
export async function handleRedisRoute(
  req: Request,
  pathname: string
): Promise<Response | null> {
  // Redis REST API accepts POST to root or any path
  if (req.method !== 'POST') {
    return null
  }

  // Only handle root path and common Upstash paths
  if (pathname !== '/' && !pathname.startsWith('/pipeline')) {
    return null
  }

  // Check for error simulation
  const errorConfig = parseErrorConfig(req)
  if (errorConfig) {
    if (errorConfig.isTimeout) {
      await delay(5000)
    }
    // Return Redis-style error
    return jsonResponse(
      { error: errorConfig.message },
      errorConfig.statusCode
    )
  }

  // Parse the command from request body
  const command = await parseRedisCommand(req)
  if (!command) {
    return jsonResponse({ error: 'Invalid command format' }, 400)
  }

  // Handle pipeline (array of commands)
  if (isPipeline(command)) {
    const results = command.map((cmd) => handleRedisCommand(cmd))
    return jsonResponse({ result: results.map((r) => r.result) })
  }

  // Handle single command
  return jsonResponse(handleRedisCommand(command))
}
