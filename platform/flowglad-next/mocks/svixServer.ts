import core from '@/utils/core'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

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

  http.post('https://api.svix.com/api/v1/app/:appId/msg', () => {
    return HttpResponse.json({
      id: `msg_mock_${core.nanoid()}`,
      eventType: 'mock.event',
      payload: {},
      timestamp: new Date().toISOString(),
    })
  }),
]

export const svixServer = setupServer(...svixHandlers)
