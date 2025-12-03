import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import core from '@/utils/core'

export const unkeyHandlers = [
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

  http.post('https://api.unkey.dev/v1/keys.createKey', () => {
    return HttpResponse.json({
      key: `unkey_mock_key_${core.nanoid()}`,
      keyId: `key_mock123_${core.nanoid()}`,
      start: new Date().toISOString(),
    })
  }),

  // Regional/catch-all variants for createKey
  http.post('https://api.us.unkey.dev/v1/keys.createKey', () => {
    return HttpResponse.json({
      key: `unkey_mock_key_${core.nanoid()}`,
      keyId: `key_mock123_${core.nanoid()}`,
      start: new Date().toISOString(),
    })
  }),
  http.post(
    /https:\/\/api(\.\w+)?\.unkey\.dev\/v1\/keys\.createKey$/,
    () => {
      return HttpResponse.json({
        key: `unkey_mock_key_${core.nanoid()}`,
        keyId: `key_mock123_${core.nanoid()}`,
        start: new Date().toISOString(),
      })
    }
  ),

  http.post('https://api.unkey.dev/v1/keys.deleteKey', () => {
    return HttpResponse.json({
      success: true,
    })
  }),

  http.post('https://api.unkey.dev/v1/keys.updateKey', () => {
    return HttpResponse.json({
      success: true,
    })
  }),
  // Add regional variants for verify, delete, and update
  http.post('https://api.us.unkey.dev/v1/keys.verifyKey', () => {
    return HttpResponse.json({
      valid: true,
      ownerId: `owner_mock_id_${core.nanoid()}`,
      meta: {},
      expires: null,
      remaining: null,
      ratelimit: null,
    })
  }),
  http.post('https://api.us.unkey.dev/v1/keys.deleteKey', () => {
    return HttpResponse.json({
      success: true,
    })
  }),
  http.post('https://api.us.unkey.dev/v1/keys.updateKey', () => {
    return HttpResponse.json({
      success: true,
    })
  }),
]

export const unkeyServer = setupServer(...unkeyHandlers)
