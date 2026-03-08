import { describe, expect, it, spyOn } from 'bun:test'
import {
  createEffectsAccumulator,
  dispatchTriggerTasksAfterCommit,
} from './transactionEffectsHelpers'
import type { QueuedTriggerTask } from './types'

describe('enqueueTriggerTask', () => {
  it('should accumulate trigger tasks in effects with the provided key, task, payload, and options', () => {
    const { effects, enqueueTriggerTask } = createEffectsAccumulator()

    const mockTask = {
      id: 'test-task-id',
      trigger: async (_payload: unknown) => ({ id: 'run-1' }),
    }

    enqueueTriggerTask(
      'my-key',
      mockTask,
      { foo: 'bar' },
      { idempotencyKey: 'idem-1' }
    )

    expect(effects.triggerTasks).toHaveLength(1)
    expect(effects.triggerTasks[0].key).toBe('my-key')
    expect(effects.triggerTasks[0].task).toBe(mockTask)
    expect(effects.triggerTasks[0].payload).toEqual({ foo: 'bar' })
    expect(effects.triggerTasks[0].options).toEqual({
      idempotencyKey: 'idem-1',
    })
  })

  it('should accumulate multiple trigger tasks in order', () => {
    const { effects, enqueueTriggerTask } = createEffectsAccumulator()

    const task1 = { id: 't1', trigger: async () => ({ id: 'r1' }) }
    const task2 = { id: 't2', trigger: async () => ({ id: 'r2' }) }

    enqueueTriggerTask('key-1', task1, 'payload-1')
    enqueueTriggerTask('key-2', task2, 'payload-2')

    expect(effects.triggerTasks).toHaveLength(2)
    expect(effects.triggerTasks[0].key).toBe('key-1')
    expect(effects.triggerTasks[1].key).toBe('key-2')
  })
})

describe('dispatchTriggerTasksAfterCommit', () => {
  it('should call task.trigger with the correct payload and options for each queued task', async () => {
    const calls1: Array<{ payload: unknown; options: unknown }> = []
    const calls2: Array<{ payload: unknown; options: unknown }> = []

    const tasks: QueuedTriggerTask[] = [
      {
        key: 'k1',
        task: {
          id: 't1',
          trigger: async (payload: unknown, options: unknown) => {
            calls1.push({ payload, options })
            return { id: 'run-1' }
          },
        },
        payload: 'hello',
        options: { idempotencyKey: 'idem-1' },
      },
      {
        key: 'k2',
        task: {
          id: 't2',
          trigger: async (payload: unknown, options: unknown) => {
            calls2.push({ payload, options })
            return { id: 'run-2' }
          },
        },
        payload: 42,
      },
    ]

    dispatchTriggerTasksAfterCommit(tasks)

    // Allow microtasks to settle
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(calls1).toHaveLength(1)
    expect(calls1[0]).toEqual({
      payload: 'hello',
      options: { idempotencyKey: 'idem-1' },
    })
    expect(calls2).toHaveLength(1)
    expect(calls2[0]).toEqual({ payload: 42, options: undefined })
  })

  it('should log errors but not throw when a task trigger rejects asynchronously', async () => {
    const consoleErrorSpy = spyOn(
      console,
      'error'
    ).mockImplementation(() => {})
    try {
      const failingTask: QueuedTriggerTask = {
        key: 'fail-key',
        task: {
          id: 'fail-task',
          trigger: async () => {
            throw new Error('trigger failed')
          },
        },
        payload: {},
      }

      // Should not throw
      expect(() =>
        dispatchTriggerTasksAfterCommit([failingTask])
      ).not.toThrow()

      // Allow the promise rejection to be caught
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(consoleErrorSpy.mock.calls[0][0]).toContain(
        'Failed to dispatch trigger task'
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('should not throw when a task trigger throws synchronously', () => {
    const syncFailingTask: QueuedTriggerTask = {
      key: 'sync-fail-key',
      task: {
        id: 'sync-fail-task',
        trigger: () => {
          throw new Error('sync trigger failed')
        },
      } as QueuedTriggerTask['task'],
      payload: {},
    }

    expect(() =>
      dispatchTriggerTasksAfterCommit([syncFailingTask])
    ).not.toThrow()
  })

  it('should do nothing when given an empty array', () => {
    // Should not throw
    dispatchTriggerTasksAfterCommit([])
  })
})
