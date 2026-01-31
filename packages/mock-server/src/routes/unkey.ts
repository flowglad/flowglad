import {
  createErrorResponse,
  delay,
  parseErrorConfig,
} from '../utils/errors'
import { generateId } from '../utils/ids'

/**
 * Generate an Unkey-style request ID (prefixed with "req_")
 */
function generateRequestId(): string {
  return generateId('req_')
}

/**
 * Generate an Unkey-style key (prefixed with "unkey_mock_key_")
 */
function generateUnkeyKey(): string {
  return generateId('unkey_mock_key_')
}

/**
 * Generate an Unkey-style key ID (prefixed with "key_mock123_")
 */
function generateKeyId(): string {
  return generateId('key_mock123_')
}

/**
 * Generate an Unkey-style identity ID (prefixed with "identity_")
 */
function generateIdentityId(): string {
  return generateId('identity_')
}

/**
 * Generate an Unkey-style owner ID (prefixed with "owner_mock_id_")
 */
function generateOwnerId(): string {
  return generateId('owner_mock_id_')
}

/**
 * Create a JSON response with standard headers
 */
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

/**
 * Handler for POST /v2/keys.createKey
 * Creates a new API key and returns the key and keyId
 */
export function handleCreateKeyV2(): Response {
  return jsonResponse({
    meta: {
      requestId: generateRequestId(),
    },
    data: {
      key: generateUnkeyKey(),
      keyId: generateKeyId(),
    },
  })
}

/**
 * Handler for POST /v2/keys.verifyKey
 * Verifies an API key and returns validation result with identity info
 */
export function handleVerifyKeyV2(): Response {
  return jsonResponse({
    meta: {
      requestId: generateRequestId(),
    },
    data: {
      valid: true,
      code: 'VALID',
      keyId: generateKeyId(),
      meta: {},
      identity: {
        id: generateIdentityId(),
        externalId: generateOwnerId(),
      },
    },
  })
}

/**
 * Handler for POST /v2/keys.deleteKey
 * Deletes an API key
 *
 * Error simulation: If the keyId contains '_error_' or '_fail_', returns a 404 error.
 * This enables testing error handling without header injection.
 */
export function handleDeleteKeyV2(keyId?: string): Response {
  // Simulate error for keyIds containing '_error_' or '_fail_'
  if (
    keyId &&
    (keyId.includes('_error_') || keyId.includes('_fail_'))
  ) {
    return jsonResponse(
      {
        meta: {
          requestId: generateRequestId(),
        },
        error: {
          code: 'NOT_FOUND',
          message: `Key ${keyId} not found`,
          docs: 'https://unkey.dev/docs/api-reference/errors/code/NOT_FOUND',
        },
      },
      404
    )
  }

  return jsonResponse({
    meta: {
      requestId: generateRequestId(),
    },
    data: {},
  })
}

/**
 * Handler for POST /v2/keys.updateKey
 * Updates an existing API key
 */
export function handleUpdateKeyV2(): Response {
  return jsonResponse({
    meta: {
      requestId: generateRequestId(),
    },
  })
}

/**
 * Handler for POST /v1/keys.verifyKey (legacy)
 * Verifies an API key using the V1 API format
 */
export function handleVerifyKeyV1(): Response {
  return jsonResponse({
    valid: true,
    ownerId: generateOwnerId(),
    meta: {},
    expires: null,
    remaining: null,
    ratelimit: null,
  })
}

/**
 * Route handler for Unkey mock server.
 * Returns a Response if the route matches, null otherwise.
 *
 * Supports error simulation via headers:
 * - X-Mock-Error: true | <status-code> | timeout
 * - X-Mock-Error-Message: <custom message>
 */
export async function handleUnkeyRoute(
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
    return createErrorResponse('unkey', errorConfig)
  }

  // Parse request body for routes that need it
  let body: { keyId?: string } = {}
  if (pathname === '/v2/keys.deleteKey') {
    try {
      body = await req.json()
    } catch {
      // Ignore parse errors, body will be empty
    }
  }

  switch (pathname) {
    case '/v2/keys.createKey':
      return handleCreateKeyV2()
    case '/v2/keys.verifyKey':
      return handleVerifyKeyV2()
    case '/v2/keys.deleteKey':
      return handleDeleteKeyV2(body.keyId)
    case '/v2/keys.updateKey':
      return handleUpdateKeyV2()
    case '/v1/keys.verifyKey':
      return handleVerifyKeyV1()
    default:
      return null
  }
}
