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
      trigger: async (_payload: { foo: string }) => ({ id: 'run-1' }),
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
    const trigger1 = async (_payload: string) => ({ id: 'run-1' })
    const trigger2 = async (
      _payload: number,
      _options?: { idempotencyKey?: string }
    ) => ({ id: 'run-2' })
    const spy1 = spyOn({ trigger: trigger1 }, 'trigger')
    const spy2 = spyOn({ trigger: trigger2 }, 'trigger')

    const tasks: QueuedTriggerTask[] = [
      {
        key: 'k1',
        task: {
          id: 't1',
          trigger: spy1 as QueuedTriggerTask['task']['trigger'],
        },
        payload: 'hello',
        options: { idempotencyKey: 'idem-1' },
      },
      {
        key: 'k2',
        task: {
          id: 't2',
          trigger: spy2 as QueuedTriggerTask['task']['trigger'],
        },
        payload: 42,
      },
    ]

    dispatchTriggerTasksAfterCommit(tasks)

    // Allow microtasks to settle
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(spy1).toHaveBeenCalledWith('hello', {
      idempotencyKey: 'idem-1',
    })
    expect(spy2).toHaveBeenCalledWith(42, undefined)
  })

  it('should log errors but not throw when a task trigger fails', async () => {
    const consoleErrorSpy = spyOn(
      console,
      'error'
    ).mockImplementation(() => {})

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
    dispatchTriggerTasksAfterCommit([failingTask])

    // Allow the promise rejection to be caught
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy.mock.calls[0][0]).toContain(
      "Failed to dispatch trigger task 'fail-key'"
    )

    consoleErrorSpy.mockRestore()
  })

  it('should do nothing when given an empty array', () => {
    // Should not throw
    dispatchTriggerTasksAfterCommit([])
  })
})
