// src/mocks/handlers.ts
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

export const triggerHandlers = [
  http.post(
    'https://api.trigger.dev/api/v1/tasks/attempt-billing-run/trigger',
    () => {
      return HttpResponse.json({
        id: 'pi_mock123',
        amount: 1000,
        currency: 'usd',
        status: 'succeeded',
      })
    }
  ),
]

export const triggerServer = setupServer(...triggerHandlers)
