import { describe, expect, it } from 'bun:test'
import {
  generateTriggerHandleId,
  handleTriggerRoute,
  handleTriggerTask,
  parseTriggerPath,
  type TriggerTaskResponse,
} from './trigger'

describe('generateTriggerHandleId', () => {
  it('returns a string prefixed with "handle_"', () => {
    const id = generateTriggerHandleId()
    expect(id.startsWith('handle_')).toBe(true)
  })

  it('generates unique IDs on each call', () => {
    const id1 = generateTriggerHandleId()
    const id2 = generateTriggerHandleId()
    expect(id1).not.toBe(id2)
  })
})

describe('parseTriggerPath', () => {
  it('extracts taskId from valid trigger path', () => {
    const taskId = parseTriggerPath('/api/v1/tasks/my-task/trigger')
    expect(taskId).toBe('my-task')
  })

  it('extracts taskId with hyphens and underscores', () => {
    const taskId = parseTriggerPath(
      '/api/v1/tasks/my-task_v2/trigger'
    )
    expect(taskId).toBe('my-task_v2')
  })

  it('extracts taskId with alphanumeric characters', () => {
    const taskId = parseTriggerPath(
      '/api/v1/tasks/attempt-billing-run/trigger'
    )
    expect(taskId).toBe('attempt-billing-run')
  })

  it('returns null for non-matching paths', () => {
    expect(parseTriggerPath('/api/v1/tasks')).toBe(null)
    expect(parseTriggerPath('/api/v1/tasks/my-task')).toBe(null)
    expect(parseTriggerPath('/api/v2/tasks/my-task/trigger')).toBe(
      null
    )
    expect(parseTriggerPath('/health')).toBe(null)
    expect(parseTriggerPath('/')).toBe(null)
  })

  it('returns null for paths with extra segments after trigger', () => {
    expect(
      parseTriggerPath('/api/v1/tasks/my-task/trigger/extra')
    ).toBe(null)
  })
})

describe('handleTriggerTask', () => {
  it('returns a Response with status 200', () => {
    const response = handleTriggerTask('my-task')
    expect(response.status).toBe(200)
  })

  it('returns Content-Type application/json header', () => {
    const response = handleTriggerTask('my-task')
    expect(response.headers.get('Content-Type')).toBe(
      'application/json'
    )
  })

  it('returns JSON body with id prefixed with "handle_" and status "QUEUED"', async () => {
    const response = handleTriggerTask('my-task')
    const body = (await response.json()) as TriggerTaskResponse
    expect(body.id.startsWith('handle_')).toBe(true)
    expect(body.status).toBe('QUEUED')
  })

  it('generates different handle IDs for different requests', async () => {
    const response1 = handleTriggerTask('task-1')
    const response2 = handleTriggerTask('task-2')
    const body1 = (await response1.json()) as TriggerTaskResponse
    const body2 = (await response2.json()) as TriggerTaskResponse
    expect(body1.id).not.toBe(body2.id)
    expect(body1.status).toBe('QUEUED')
    expect(body2.status).toBe('QUEUED')
  })
})

describe('handleTriggerRoute', () => {
  it('returns Response for POST requests to valid trigger path', async () => {
    const req = new Request(
      'http://localhost/api/v1/tasks/my-task/trigger',
      {
        method: 'POST',
      }
    )
    const response = await handleTriggerRoute(
      req,
      '/api/v1/tasks/my-task/trigger'
    )
    expect(response).not.toBe(null)
    expect(response!.status).toBe(200)
    const body = (await response!.json()) as TriggerTaskResponse
    expect(body.id.startsWith('handle_')).toBe(true)
    expect(body.status).toBe('QUEUED')
  })

  it('returns null for GET requests', async () => {
    const req = new Request(
      'http://localhost/api/v1/tasks/my-task/trigger',
      {
        method: 'GET',
      }
    )
    const response = await handleTriggerRoute(
      req,
      '/api/v1/tasks/my-task/trigger'
    )
    expect(response).toBe(null)
  })

  it('returns null for non-matching paths', async () => {
    const req = new Request('http://localhost/health', {
      method: 'POST',
    })
    const response = await handleTriggerRoute(req, '/health')
    expect(response).toBe(null)
  })
})
