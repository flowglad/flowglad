import { expect } from 'bun:test'
import * as triggerMocks from '@/__mocks__/@trigger'

export const resetTriggerMocks = () => {
  Object.values(triggerMocks).forEach((mock: any) => {
    if (mock.trigger) {
      mock.trigger.mockReset()
      mock.trigger.mockResolvedValue(undefined)
    }
  })
}

export const getTriggerMock = (taskName: string) => {
  const mock = Object.values(triggerMocks).find(
    (m: any) => m.taskName === taskName
  )
  if (!mock) {
    throw new Error(`No mock found for trigger task: ${taskName}`)
  }
  return mock
}

export const mockTriggerResponse = (
  taskName: string,
  response: any
) => {
  const mock = getTriggerMock(taskName)
  mock.trigger.mockResolvedValueOnce(response)
}

export const mockTriggerError = (taskName: string, error: Error) => {
  const mock = getTriggerMock(taskName)
  mock.trigger.mockRejectedValueOnce(error)
}

export const expectTriggerCalled = (
  taskName: string,
  params?: any
) => {
  const mock = getTriggerMock(taskName)
  if (params) {
    expect(mock.trigger).toHaveBeenCalledWith(params)
  } else {
    expect(mock.trigger).toHaveBeenCalled()
  }
}

export const expectTriggerNotCalled = (taskName: string) => {
  const mock = getTriggerMock(taskName)
  expect(mock.trigger).not.toHaveBeenCalled()
}
