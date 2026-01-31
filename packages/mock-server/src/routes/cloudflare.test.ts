import { afterEach, describe, expect, it } from 'bun:test'
import {
  clearObjectStore,
  getObjectStore,
  handleCloudflareRoute,
} from './cloudflare'

describe('Cloudflare R2 mock routes', () => {
  afterEach(() => {
    clearObjectStore()
  })

  describe('PUT object', () => {
    it('stores an object and returns 200 with ETag', async () => {
      const req = new Request(
        'http://localhost/test-bucket/test-key.txt',
        {
          method: 'PUT',
          body: 'Hello, World!',
          headers: { 'Content-Type': 'text/plain' },
        }
      )

      const res = await handleCloudflareRoute(
        req,
        '/test-bucket/test-key.txt'
      )

      expect(res?.status).toBe(200)
      expect(res?.headers.get('ETag')).toMatch(/^"[a-f0-9]+"$/)
      expect(res?.headers.get('x-amz-request-id')).toMatch(
        /^mock-\d+$/
      )

      // Verify storage
      const store = getObjectStore()
      expect(store.has('test-bucket/test-key.txt')).toBe(true)
      expect(store.get('test-bucket/test-key.txt')?.body).toBe(
        'Hello, World!'
      )
    })

    it('stores nested keys correctly', async () => {
      const req = new Request(
        'http://localhost/bucket/org-123/markdown/file.md',
        {
          method: 'PUT',
          body: '# Markdown',
          headers: { 'Content-Type': 'text/markdown' },
        }
      )

      const res = await handleCloudflareRoute(
        req,
        '/bucket/org-123/markdown/file.md'
      )

      expect(res?.status).toBe(200)

      const store = getObjectStore()
      expect(store.has('bucket/org-123/markdown/file.md')).toBe(true)
    })

    it('overwrites existing objects', async () => {
      // First write
      await handleCloudflareRoute(
        new Request('http://localhost/bucket/key', {
          method: 'PUT',
          body: 'version1',
        }),
        '/bucket/key'
      )

      // Second write
      await handleCloudflareRoute(
        new Request('http://localhost/bucket/key', {
          method: 'PUT',
          body: 'version2',
        }),
        '/bucket/key'
      )

      const store = getObjectStore()
      expect(store.get('bucket/key')?.body).toBe('version2')
    })
  })

  describe('GET object', () => {
    it('retrieves a stored object', async () => {
      // Store first
      await handleCloudflareRoute(
        new Request('http://localhost/bucket/key.txt', {
          method: 'PUT',
          body: 'test content',
          headers: { 'Content-Type': 'text/plain' },
        }),
        '/bucket/key.txt'
      )

      // Retrieve
      const req = new Request('http://localhost/bucket/key.txt', {
        method: 'GET',
      })
      const res = await handleCloudflareRoute(req, '/bucket/key.txt')

      expect(res?.status).toBe(200)
      expect(await res?.text()).toBe('test content')
      expect(res?.headers.get('Content-Type')).toBe('text/plain')
      expect(res?.headers.get('Content-Length')).toBe('12')
      expect(res?.headers.get('ETag')).toMatch(/^"[a-f0-9]+"$/)
    })

    it('returns 404 for non-existent objects', async () => {
      const req = new Request('http://localhost/bucket/missing-key', {
        method: 'GET',
      })
      const res = await handleCloudflareRoute(
        req,
        '/bucket/missing-key'
      )

      expect(res?.status).toBe(404)
      const body = await res?.text()
      expect(body).toContain('NoSuchKey')
      expect(body).toContain('missing-key')
    })
  })

  describe('HEAD object', () => {
    it('returns metadata for existing object', async () => {
      // Store first
      await handleCloudflareRoute(
        new Request('http://localhost/bucket/key', {
          method: 'PUT',
          body: 'test content',
          headers: { 'Content-Type': 'application/json' },
        }),
        '/bucket/key'
      )

      // Head request
      const req = new Request('http://localhost/bucket/key', {
        method: 'HEAD',
      })
      const res = await handleCloudflareRoute(req, '/bucket/key')

      expect(res?.status).toBe(200)
      expect(res?.headers.get('Content-Type')).toBe(
        'application/json'
      )
      expect(res?.headers.get('Content-Length')).toBe('12')
      // Last-Modified should be a valid HTTP date string
      const lastModified = res?.headers.get('Last-Modified')
      expect(typeof lastModified).toBe('string')
      expect(new Date(lastModified!).getTime()).toBeGreaterThan(0)
    })

    it('returns 404 for non-existent objects', async () => {
      const req = new Request('http://localhost/bucket/missing', {
        method: 'HEAD',
      })
      const res = await handleCloudflareRoute(req, '/bucket/missing')

      expect(res?.status).toBe(404)
    })
  })

  describe('DELETE object', () => {
    it('deletes an existing object', async () => {
      // Store first
      await handleCloudflareRoute(
        new Request('http://localhost/bucket/key', {
          method: 'PUT',
          body: 'test',
        }),
        '/bucket/key'
      )

      expect(getObjectStore().has('bucket/key')).toBe(true)

      // Delete
      const req = new Request('http://localhost/bucket/key', {
        method: 'DELETE',
      })
      const res = await handleCloudflareRoute(req, '/bucket/key')

      expect(res?.status).toBe(204)
      expect(getObjectStore().has('bucket/key')).toBe(false)
    })

    it('returns 204 even for non-existent objects (S3 behavior)', async () => {
      const req = new Request('http://localhost/bucket/missing', {
        method: 'DELETE',
      })
      const res = await handleCloudflareRoute(req, '/bucket/missing')

      expect(res?.status).toBe(204)
    })
  })

  describe('health check', () => {
    it('returns healthy status', async () => {
      const req = new Request('http://localhost/health', {
        method: 'GET',
      })
      const res = await handleCloudflareRoute(req, '/health')

      expect(res?.status).toBe(200)
      const body = await res?.json()
      expect(body).toEqual({ status: 'ok', service: 'cloudflare' })
    })
  })

  describe('error handling', () => {
    it('returns 400 for missing bucket', async () => {
      const req = new Request('http://localhost/', { method: 'GET' })
      const res = await handleCloudflareRoute(req, '/')

      expect(res?.status).toBe(400)
    })
  })
})
