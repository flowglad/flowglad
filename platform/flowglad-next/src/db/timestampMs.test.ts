import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { zodEpochMs } from '@/db/timestampMs'

describe('zodEpochMs', () => {
  it('fails if parsing null or undefined', () => {
    const nullResult = zodEpochMs.safeParse(null)
    const undefinedResult = zodEpochMs.safeParse(undefined)

    expect(nullResult.success).toBe(false)
    expect(undefinedResult.success).toBe(false)
  })

  it('parses Date instances to epoch milliseconds', () => {
    const date = new Date('2020-01-01T00:00:00.000Z')
    const result = zodEpochMs.parse(date)
    expect(result).toBe(date.getTime())
  })

  it('parses numbers (epoch ms) to epoch milliseconds', () => {
    const epochMs = 1712345678901
    const result = zodEpochMs.parse(epochMs)
    expect(result).toBe(epochMs)
  })

  it('parses ISO strings to epoch milliseconds and rejects invalid strings', () => {
    const iso = '2020-01-01T00:00:00.000Z'
    const parsedIso = zodEpochMs.parse(iso)
    expect(parsedIso).toBe(Date.parse(iso))

    const bad = 'not-a-date'
    const badResult = zodEpochMs.safeParse(bad)
    expect(badResult.success).toBe(false)
    /**
     * numeric string is not a valid date format.
     * Even new Date("1712345678901") throws an error in JS
     */
    const numericString = '1712345678901'
    const numericStringResult = zodEpochMs.safeParse(numericString)
    expect(numericStringResult.success).toBe(false)
  })

  it('rejects non-integer numbers and NaN', () => {
    const floatMs = 1712345678901.5
    expect(zodEpochMs.safeParse(floatMs).success).toBe(false)

    // NaN is not a valid number for z.number()
    expect(zodEpochMs.safeParse(Number.NaN).success).toBe(false)
  })

  it('when optional, parses undefined successfully', () => {
    const optionalSchema = zodEpochMs.optional()
    const result = optionalSchema.safeParse(undefined)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBeUndefined()
    }

    // Also ensure it still parses a valid Date when optional
    const date = new Date('2021-06-15T12:34:56.000Z')
    const validResult = optionalSchema.parse(date)
    expect(validResult).toBe(date.getTime())
  })

  it('when optional, still rejects null', () => {
    const optionalSchema = zodEpochMs.optional()
    const nullResult = optionalSchema.safeParse(null)
    expect(nullResult.success).toBe(false)
  })
})
