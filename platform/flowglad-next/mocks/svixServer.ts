import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import core from '@/utils/core'

export const svixHandlers = [
  http.post('https://api.svix.com/api/v1/app', () => {
    return HttpResponse.json({
      id: `app_mock_${core.nanoid()}`,
      name: 'Mock Application',
      uid: core.nanoid(),
      createdAt: new Date().toISOString(),
    })
  }),
  // US region endpoints
  http.post('https://api.us.svix.com/api/v1/app', () => {
    return HttpResponse.json({
      id: `app_mock_${core.nanoid()}`,
      name: 'Mock Application',
      uid: core.nanoid(),
      createdAt: new Date().toISOString(),
    })
  }),
  http.get('https://api.svix.com/api/v1/app/:appId', () => {
    return HttpResponse.json({
      id: `app_mock_${core.nanoid()}`,
      name: 'Mock Application',
      uid: core.nanoid(),
      createdAt: new Date().toISOString(),
    })
  }),
  http.get('https://api.us.svix.com/api/v1/app/:appId', () => {
    return HttpResponse.json({
      id: `app_mock_${core.nanoid()}`,
      name: 'Mock Application',
      uid: core.nanoid(),
      createdAt: new Date().toISOString(),
    })
  }),
  http.post('https://api.svix.com/api/v1/app/:appId/endpoint', () => {
    return HttpResponse.json({
      id: `ep_mock_${core.nanoid()}`,
      url: 'https://mock-endpoint.com/webhook',
      uid: core.nanoid(),
      createdAt: new Date().toISOString(),
    })
  }),
  // US region variants for endpoint and message creation
  http.post(
    'https://api.us.svix.com/api/v1/app/:appId/endpoint',
    () => {
      return HttpResponse.json({
        id: `ep_mock_${core.nanoid()}`,
        url: 'https://mock-endpoint.com/webhook',
        uid: core.nanoid(),
        createdAt: new Date().toISOString(),
      })
    }
  ),

  http.post('https://api.svix.com/api/v1/app/:appId/msg', () => {
    return HttpResponse.json({
      id: `msg_mock_${core.nanoid()}`,
      eventType: 'mock.event',
      payload: {},
      timestamp: new Date().toISOString(),
    })
  }),
  http.post('https://api.us.svix.com/api/v1/app/:appId/msg', () => {
    return HttpResponse.json({
      id: `msg_mock_${core.nanoid()}`,
      eventType: 'mock.event',
      payload: {},
      timestamp: new Date().toISOString(),
    })
  }),

  // Endpoint update (PATCH)
  http.patch(
    'https://api.svix.com/api/v1/app/:appId/endpoint/:endpointId',
    () => {
      return HttpResponse.json({
        id: `ep_mock_${core.nanoid()}`,
        url: 'https://mock-endpoint.com/webhook',
        uid: core.nanoid(),
        createdAt: new Date().toISOString(),
      })
    }
  ),
  http.patch(
    'https://api.us.svix.com/api/v1/app/:appId/endpoint/:endpointId',
    () => {
      return HttpResponse.json({
        id: `ep_mock_${core.nanoid()}`,
        url: 'https://mock-endpoint.com/webhook',
        uid: core.nanoid(),
        createdAt: new Date().toISOString(),
      })
    }
  ),

  // Endpoint signing secret
  http.get(
    'https://api.svix.com/api/v1/app/:appId/endpoint/:endpointId/secret',
    () => {
      return HttpResponse.json({
        key: 'whsec_mock_secret_key_12345',
      })
    }
  ),
  http.get(
    'https://api.us.svix.com/api/v1/app/:appId/endpoint/:endpointId/secret',
    () => {
      return HttpResponse.json({
        key: 'whsec_mock_secret_key_12345',
      })
    }
  ),

  // Catch-all variants for app retrieval to avoid missing regional or trailing-slash differences
  http.get(
    /https:\/\/api(\.\w+)?\.svix\.com\/api\/v1\/app\/[^/]+\/?$/,
    () => {
      return HttpResponse.json({
        id: `app_mock_${core.nanoid()}`,
        name: 'Mock Application',
        uid: core.nanoid(),
        createdAt: new Date().toISOString(),
      })
    }
  ),
]

export const svixServer = setupServer(...svixHandlers)
