import { describe, expect, it } from 'bun:test'
import {
  parseAndValidateCursor,
  parsePaginationParams,
} from './pagination'

const b64 = (obj: unknown) =>
  Buffer.from(JSON.stringify(obj)).toString('base64')

describe('parseAndValidateCursor', () => {
  it('rejects cursor missing id', () => {
    const cursor = b64({
      parameters: {},
      createdAt: new Date().getTime(),
      direction: 'forward',
    })
    expect(() => parseAndValidateCursor(cursor)).toThrow(
      /Invalid cursor/i
    )
  })

  it('accepts valid cursor with id and direction', () => {
    const cursor = b64({
      parameters: {},
      createdAt: Date.now(),
      id: 'abc123',
      direction: 'forward',
    })
    const parsed = parseAndValidateCursor(cursor)
    expect(parsed.id).toBe('abc123')
    expect(
      parsed.direction === 'forward' ||
        parsed.direction === 'backward'
    ).toBe(true)
  })

  it('rejects malformed base64/JSON cursor', () => {
    expect(() => parseAndValidateCursor('not-base64')).toThrow()
  })
})

describe('parsePaginationParams (strict single values)', () => {
  it('accepts single values', () => {
    const out = parsePaginationParams({
      limit: '10',
    })
    expect(out.limit).toBe(10)
  })

  it('rejects duplicate limit values', () => {
    const qp: Record<string, string | string[]> = {
      limit: ['10', '20'],
    }
    expect(() => parsePaginationParams(qp)).toThrow(
      /Multiple 'limit' values/i
    )
  })

  it('rejects duplicate cursor values', () => {
    const qp: Record<string, string | string[]> = {
      cursor: ['a', 'b'],
    }
    expect(() => parsePaginationParams(qp)).toThrow(
      /Multiple 'cursor' values/i
    )
  })
})
