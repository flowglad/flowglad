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

// Redis commands can have string or number arguments (e.g., ZADD key score member)
type RedisCommandArg = string | number
type RedisCommand = RedisCommandArg[]

interface RedisSuccessResponse {
  result: unknown
}

interface RedisErrorResponse {
  error: string
}

/**
 * Check if a value is a valid Redis command argument (string or number)
 */
function isValidArg(value: unknown): value is RedisCommandArg {
  return typeof value === 'string' || typeof value === 'number'
}

/**
 * Type guard to check if a value is a valid Redis command (array of strings/numbers)
 */
function isRedisCommand(value: unknown): value is RedisCommand {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(isValidArg)
  )
}

/**
 * Type guard to check if a value is a pipeline (array of Redis commands)
 */
function isRedisCommandArray(
  value: unknown
): value is RedisCommand[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    Array.isArray(value[0]) &&
    value.every((cmd) => Array.isArray(cmd) && cmd.every(isValidArg))
  )
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
  // Convert to string in case it's a number (shouldn't happen for command names, but be safe)
  const upperCmd = String(cmd).toUpperCase()

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

    // Keys - return empty array
    case 'KEYS':
      return { result: [] }

    // Scan - return [cursor, keys[]] format per Redis semantics
    case 'SCAN':
      return { result: ['0', []] }

    // Ping - return PONG
    case 'PING':
      return { result: 'PONG' }

    // Stream commands for Redis Streams
    case 'XADD': {
      // XADD returns a stream entry ID like "1234567890123-0"
      // When '*' is used, Redis auto-generates the ID based on timestamp
      const timestamp = Date.now()
      return { result: `${timestamp}-0` }
    }

    case 'XREAD':
    case 'XRANGE':
    case 'XREVRANGE':
      // Return empty array (no entries in stream)
      return { result: [] }

    case 'XLEN':
      // Return 0 (empty stream)
      return { result: 0 }

    case 'XTRIM':
      // Return number of entries deleted (0 for stateless mock)
      return { result: 0 }

    case 'XDEL':
      // Return number of entries deleted
      return { result: 1 }

    case 'XINFO':
      // Return basic stream info (stateless mock returns empty info)
      return {
        result: {
          length: 0,
          'first-entry': null,
          'last-entry': null,
        },
      }

    // Lua script commands - return mock result for LRU eviction script
    // The LRU script returns JSON array [evictedCount, orphansRemoved]
    case 'EVAL':
    case 'EVALSHA':
      // Return [0, 0] as JSON string (no evictions in stateless mock)
      return { result: '[0,0]' }

    // Sorted set read commands
    case 'ZCARD':
      // Return 0 (empty sorted set)
      return { result: 0 }

    case 'ZSCORE':
      // Return null (member not found)
      return { result: null }

    // GETDEL - get and delete atomically
    case 'GETDEL':
      // Return null (cache miss, like GET)
      return { result: null }

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
    // Check pipeline first (array of arrays) before single command (array of strings)
    if (isRedisCommandArray(body)) {
      return body
    }
    if (isRedisCommand(body)) {
      return body
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
  // Upstash pipeline returns array of {result: value} objects at top level
  if (isPipeline(command)) {
    const results = command.map((cmd) => handleRedisCommand(cmd))
    // Return array directly, not wrapped in {result: ...}
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Handle single command
  return jsonResponse(handleRedisCommand(command))
}
