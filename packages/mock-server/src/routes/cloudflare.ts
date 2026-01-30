/**
 * Cloudflare R2 (S3-compatible) mock routes
 *
 * Provides a simple S3-compatible API for testing R2 interactions.
 * Stores objects in memory with basic CRUD operations.
 */

// In-memory object storage
const objectStore = new Map<
  string,
  {
    body: string
    contentType: string
    contentLength: number
    lastModified: Date
  }
>()

/**
 * Parse S3-style path: /:bucket/:key
 */
function parseS3Path(pathname: string): {
  bucket: string | null
  key: string | null
} {
  // Remove leading slash and split
  const parts = pathname.slice(1).split('/')
  if (parts.length < 2) {
    return { bucket: parts[0] || null, key: null }
  }
  const bucket = parts[0]
  const key = parts.slice(1).join('/')
  return { bucket, key }
}

/**
 * Generate S3-style ETag from content
 */
function generateETag(content: string): string {
  // Simple hash for testing - in production S3 uses MD5
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return `"${Math.abs(hash).toString(16)}"`
}

export async function handleCloudflareRoute(
  req: Request,
  pathname: string
): Promise<Response | null> {
  const { bucket, key } = parseS3Path(pathname)
  const method = req.method

  // Health check
  if (pathname === '/health') {
    return new Response(
      JSON.stringify({ status: 'ok', service: 'cloudflare' }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  if (!bucket) {
    return new Response('Bad Request: Missing bucket', {
      status: 400,
    })
  }

  const fullKey = key ? `${bucket}/${key}` : bucket

  // PUT - Store object
  if (method === 'PUT' && key) {
    const body = await req.text()
    const contentType =
      req.headers.get('content-type') || 'application/octet-stream'

    objectStore.set(fullKey, {
      body,
      contentType,
      contentLength: body.length,
      lastModified: new Date(),
    })

    return new Response(null, {
      status: 200,
      headers: {
        ETag: generateETag(body),
        'x-amz-request-id': `mock-${Date.now()}`,
      },
    })
  }

  // GET - Retrieve object
  if (method === 'GET' && key) {
    const obj = objectStore.get(fullKey)
    if (!obj) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>NoSuchKey</Code>
  <Message>The specified key does not exist.</Message>
  <Key>${key}</Key>
</Error>`,
        {
          status: 404,
          headers: { 'Content-Type': 'application/xml' },
        }
      )
    }

    return new Response(obj.body, {
      status: 200,
      headers: {
        'Content-Type': obj.contentType,
        'Content-Length': obj.contentLength.toString(),
        'Last-Modified': obj.lastModified.toUTCString(),
        ETag: generateETag(obj.body),
      },
    })
  }

  // HEAD - Check object exists
  if (method === 'HEAD' && key) {
    const obj = objectStore.get(fullKey)
    if (!obj) {
      return new Response(null, { status: 404 })
    }

    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': obj.contentType,
        'Content-Length': obj.contentLength.toString(),
        'Last-Modified': obj.lastModified.toUTCString(),
        ETag: generateETag(obj.body),
      },
    })
  }

  // DELETE - Remove object
  if (method === 'DELETE' && key) {
    objectStore.delete(fullKey)
    return new Response(null, { status: 204 })
  }

  // POST with delete query - Batch delete (simplified)
  // Note: Query string is not part of pathname, need to check request URL
  const url = new URL(req.url)
  if (method === 'POST' && url.searchParams.has('delete')) {
    // For simplicity, just return success
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
</DeleteResult>`,
      {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      }
    )
  }

  return null
}

// Export for testing
export function clearObjectStore(): void {
  objectStore.clear()
}

export function getObjectStore(): Map<
  string,
  {
    body: string
    contentType: string
    contentLength: number
    lastModified: Date
  }
> {
  return objectStore
}
