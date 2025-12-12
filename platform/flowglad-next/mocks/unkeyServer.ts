import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import core from '@/utils/core'

export const unkeyHandlers = [
  // V2 API endpoints (current SDK version)
  http.post('https://api.unkey.com/v2/keys.createKey', () => {
    return HttpResponse.json({
      meta: {
        requestId: `req_${core.nanoid()}`,
      },
      data: {
        key: `unkey_mock_key_${core.nanoid()}`,
        keyId: `key_mock123_${core.nanoid()}`,
      },
    })
  }),

  http.post('https://api.unkey.com/v2/keys.verifyKey', () => {
    return HttpResponse.json({
      meta: {
        requestId: `req_${core.nanoid()}`,
      },
      data: {
        valid: true,
        code: 'VALID',
        keyId: `key_mock123_${core.nanoid()}`,
        meta: {},
        identity: {
          id: `identity_${core.nanoid()}`,
          externalId: `owner_mock_id_${core.nanoid()}`,
        },
      },
    })
  }),

  http.post('https://api.unkey.com/v2/keys.deleteKey', () => {
    return HttpResponse.json({
      meta: {
        requestId: `req_${core.nanoid()}`,
      },
    })
  }),

  http.post('https://api.unkey.com/v2/keys.updateKey', () => {
    return HttpResponse.json({
      meta: {
        requestId: `req_${core.nanoid()}`,
      },
    })
  }),

  // Catch-all regex for v2 endpoints (handles regional variants and any other patterns)
  http.post(
    /https:\/\/api(\.\w+)?\.unkey\.com\/v2\/keys\.createKey/,
    () => {
      return HttpResponse.json({
        meta: {
          requestId: `req_${core.nanoid()}`,
        },
        data: {
          key: `unkey_mock_key_${core.nanoid()}`,
          keyId: `key_mock123_${core.nanoid()}`,
        },
      })
    }
  ),

  http.post(
    /https:\/\/api(\.\w+)?\.unkey\.com\/v2\/keys\.verifyKey/,
    () => {
      return HttpResponse.json({
        meta: {
          requestId: `req_${core.nanoid()}`,
        },
        data: {
          valid: true,
          code: 'VALID',
          keyId: `key_mock123_${core.nanoid()}`,
          meta: {},
          identity: {
            id: `identity_${core.nanoid()}`,
            externalId: `owner_mock_id_${core.nanoid()}`,
          },
        },
      })
    }
  ),

  http.post(
    /https:\/\/api(\.\w+)?\.unkey\.com\/v2\/keys\.deleteKey/,
    () => {
      return HttpResponse.json({
        meta: {
          requestId: `req_${core.nanoid()}`,
        },
      })
    }
  ),

  http.post(
    /https:\/\/api(\.\w+)?\.unkey\.com\/v2\/keys\.updateKey/,
    () => {
      return HttpResponse.json({
        meta: {
          requestId: `req_${core.nanoid()}`,
        },
      })
    }
  ),

  // V1 API endpoints (kept for backward compatibility)
  http.post('https://api.unkey.dev/v1/keys.verifyKey', () => {
    return HttpResponse.json({
      valid: true,
      ownerId: `owner_mock_id_${core.nanoid()}`,
      meta: {},
      expires: null,
      remaining: null,
      ratelimit: null,
    })
  }),
]

export const unkeyServer = setupServer(...unkeyHandlers)
