import { describe, expect, it } from 'bun:test'
import {
  generateId,
  generateSvixAppId,
  generateSvixMessageId,
  generateTriggerRunId,
  generateUnkeyKeyId,
} from './ids'

describe('generateId', () => {
  it('generates a string of default length 21 when no arguments provided', () => {
    const id = generateId()
    expect(typeof id).toBe('string')
    expect(id.length).toBe(21)
  })

  it('prepends the prefix when provided', () => {
    const id = generateId('test_')
    expect(id.startsWith('test_')).toBe(true)
    expect(id.length).toBe(21 + 5) // 21 random chars + 5 char prefix
  })

  it('generates an ID with custom size when size argument provided', () => {
    const id = generateId(undefined, 10)
    expect(id.length).toBe(10)
  })

  it('generates an ID with both prefix and custom size', () => {
    const id = generateId('pre_', 10)
    expect(id.startsWith('pre_')).toBe(true)
    expect(id.length).toBe(10 + 4) // 10 random chars + 4 char prefix
  })

  it('generates unique IDs on consecutive calls', () => {
    const id1 = generateId()
    const id2 = generateId()
    expect(id1).not.toBe(id2)
  })
})

describe('generateSvixMessageId', () => {
  it('generates an ID with "msg_" prefix and default length', () => {
    const id = generateSvixMessageId()
    expect(id.startsWith('msg_')).toBe(true)
    expect(id.length).toBe(21 + 4) // 21 random + 4 char prefix
  })
})

describe('generateSvixAppId', () => {
  it('generates an ID with "app_" prefix and default length', () => {
    const id = generateSvixAppId()
    expect(id.startsWith('app_')).toBe(true)
    expect(id.length).toBe(21 + 4)
  })
})

describe('generateUnkeyKeyId', () => {
  it('generates an ID with "key_" prefix and default length', () => {
    const id = generateUnkeyKeyId()
    expect(id.startsWith('key_')).toBe(true)
    expect(id.length).toBe(21 + 4)
  })
})

describe('generateTriggerRunId', () => {
  it('generates an ID with "run_" prefix and default length', () => {
    const id = generateTriggerRunId()
    expect(id.startsWith('run_')).toBe(true)
    expect(id.length).toBe(21 + 4)
  })
})
