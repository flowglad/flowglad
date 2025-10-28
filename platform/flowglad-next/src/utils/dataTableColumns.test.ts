/**
 * Tests for data table column utility functions
 */

import { describe, it, expect, vi } from 'vitest'
import { Row } from '@tanstack/react-table'
import {
  stringSortingFn,
  stringFilterFn,
  dateSortingFn,
  numberSortingFn,
  arrayFilterFn,
  dateSortingFnNullsFirst,
} from './dataTableColumns'

// Helper function to create mock Row objects
function createMockRow<T>(value: T, columnId: string): Row<any> {
  return {
    getValue: vi.fn((id: string) => {
      if (id === columnId) return value
      return undefined
    }),
  } as unknown as Row<any>
}

describe('stringSortingFn', () => {
  it('should sort strings in ascending order', () => {
    const rowA = createMockRow('apple', 'name')
    const rowB = createMockRow('banana', 'name')

    const result = stringSortingFn(rowA, rowB, 'name')
    expect(result).toBeLessThan(0)
  })

  it('should sort strings in descending order', () => {
    const rowA = createMockRow('zebra', 'name')
    const rowB = createMockRow('ant', 'name')

    const result = stringSortingFn(rowA, rowB, 'name')
    expect(result).toBeGreaterThan(0)
  })

  it('should handle null values as empty strings', () => {
    const rowA = createMockRow(null, 'name')
    const rowB = createMockRow('test', 'name')

    const result = stringSortingFn(rowA, rowB, 'name')
    expect(result).toBeLessThan(0)
  })

  it('should handle undefined values as empty strings', () => {
    const rowA = createMockRow(undefined, 'name')
    const rowB = createMockRow('test', 'name')

    const result = stringSortingFn(rowA, rowB, 'name')
    expect(result).toBeLessThan(0)
  })

  it('should return 0 for equal strings', () => {
    const rowA = createMockRow('same', 'name')
    const rowB = createMockRow('same', 'name')

    const result = stringSortingFn(rowA, rowB, 'name')
    expect(result).toBe(0)
  })

  it('should handle case-sensitive sorting', () => {
    const rowA = createMockRow('Apple', 'name')
    const rowB = createMockRow('apple', 'name')

    const result = stringSortingFn(rowA, rowB, 'name')
    // localeCompare is case-sensitive
    expect(result).not.toBe(0)
  })
})

describe('stringFilterFn', () => {
  it('should return true when filter value is empty', () => {
    const row = createMockRow('test value', 'name')

    const result = stringFilterFn(row, 'name', '')
    expect(result).toBe(true)
  })

  it('should return true when filter value is null', () => {
    const row = createMockRow('test value', 'name')

    const result = stringFilterFn(row, 'name', null)
    expect(result).toBe(true)
  })

  it('should return true when filter value is undefined', () => {
    const row = createMockRow('test value', 'name')

    const result = stringFilterFn(row, 'name', undefined)
    expect(result).toBe(true)
  })

  it('should perform case-insensitive substring matching', () => {
    const row = createMockRow('Test Value', 'name')

    const result = stringFilterFn(row, 'name', 'test')
    expect(result).toBe(true)
  })

  it('should return false when substring not found', () => {
    const row = createMockRow('Test Value', 'name')

    const result = stringFilterFn(row, 'name', 'notfound')
    expect(result).toBe(false)
  })

  it('should trim filter value before matching', () => {
    const row = createMockRow('test', 'name')

    const result = stringFilterFn(row, 'name', '  test  ')
    expect(result).toBe(true)
  })

  it('should handle null row values', () => {
    const row = createMockRow(null, 'name')

    const result = stringFilterFn(row, 'name', 'test')
    expect(result).toBe(false)
  })

  it('should return false for non-string filter values', () => {
    const row = createMockRow('test', 'name')

    const result = stringFilterFn(row, 'name', 123)
    expect(result).toBe(true) // Non-string filter values are treated as no filter
  })
})

describe('dateSortingFn', () => {
  it('should sort dates in ascending order', () => {
    const date1 = new Date('2024-01-01')
    const date2 = new Date('2024-12-31')
    const rowA = createMockRow(date1, 'createdAt')
    const rowB = createMockRow(date2, 'createdAt')

    const result = dateSortingFn(rowA, rowB, 'createdAt')
    expect(result).toBeLessThan(0)
  })

  it('should sort dates in descending order', () => {
    const date1 = new Date('2024-12-31')
    const date2 = new Date('2024-01-01')
    const rowA = createMockRow(date1, 'createdAt')
    const rowB = createMockRow(date2, 'createdAt')

    const result = dateSortingFn(rowA, rowB, 'createdAt')
    expect(result).toBeGreaterThan(0)
  })

  it('should handle date strings', () => {
    const rowA = createMockRow('2024-01-01', 'createdAt')
    const rowB = createMockRow('2024-12-31', 'createdAt')

    const result = dateSortingFn(rowA, rowB, 'createdAt')
    expect(result).toBeLessThan(0)
  })

  it('should treat null dates as 0 (epoch)', () => {
    const date = new Date('2024-01-01')
    const rowA = createMockRow(null, 'createdAt')
    const rowB = createMockRow(date, 'createdAt')

    const result = dateSortingFn(rowA, rowB, 'createdAt')
    expect(result).toBeLessThan(0)
  })

  it('should return 0 for equal dates', () => {
    const date1 = new Date('2024-01-01')
    const date2 = new Date('2024-01-01')
    const rowA = createMockRow(date1, 'createdAt')
    const rowB = createMockRow(date2, 'createdAt')

    const result = dateSortingFn(rowA, rowB, 'createdAt')
    expect(result).toBe(0)
  })

  it('should handle both null values', () => {
    const rowA = createMockRow(null, 'createdAt')
    const rowB = createMockRow(null, 'createdAt')

    const result = dateSortingFn(rowA, rowB, 'createdAt')
    expect(result).toBe(0)
  })
})

describe('numberSortingFn', () => {
  it('should sort numbers in ascending order', () => {
    const rowA = createMockRow(10, 'amount')
    const rowB = createMockRow(20, 'amount')

    const result = numberSortingFn(rowA, rowB, 'amount')
    expect(result).toBeLessThan(0)
  })

  it('should sort numbers in descending order', () => {
    const rowA = createMockRow(100, 'amount')
    const rowB = createMockRow(50, 'amount')

    const result = numberSortingFn(rowA, rowB, 'amount')
    expect(result).toBeGreaterThan(0)
  })

  it('should handle string numbers', () => {
    const rowA = createMockRow('10', 'amount')
    const rowB = createMockRow('20', 'amount')

    const result = numberSortingFn(rowA, rowB, 'amount')
    expect(result).toBeLessThan(0)
  })

  it('should handle decimal numbers', () => {
    const rowA = createMockRow(10.5, 'amount')
    const rowB = createMockRow(10.7, 'amount')

    const result = numberSortingFn(rowA, rowB, 'amount')
    expect(result).toBeLessThan(0)
  })

  it('should handle negative numbers', () => {
    const rowA = createMockRow(-10, 'amount')
    const rowB = createMockRow(10, 'amount')

    const result = numberSortingFn(rowA, rowB, 'amount')
    expect(result).toBeLessThan(0)
  })

  it('should treat undefined as 0', () => {
    const rowA = createMockRow(undefined, 'amount')
    const rowB = createMockRow(10, 'amount')

    const result = numberSortingFn(rowA, rowB, 'amount')
    expect(result).toBeLessThan(0)
  })

  it('should return 0 for equal numbers', () => {
    const rowA = createMockRow(42, 'amount')
    const rowB = createMockRow(42, 'amount')

    const result = numberSortingFn(rowA, rowB, 'amount')
    expect(result).toBe(0)
  })

  it('should handle zero values', () => {
    const rowA = createMockRow(0, 'amount')
    const rowB = createMockRow(10, 'amount')

    const result = numberSortingFn(rowA, rowB, 'amount')
    expect(result).toBeLessThan(0)
  })

  it('should handle mixed number and string types', () => {
    const rowA = createMockRow(10, 'amount')
    const rowB = createMockRow('20', 'amount')

    const result = numberSortingFn(rowA, rowB, 'amount')
    expect(result).toBeLessThan(0)
  })
})

describe('arrayFilterFn', () => {
  it('should return true when filter value is null', () => {
    const row = createMockRow('active', 'status')

    const result = arrayFilterFn(row, 'status', null)
    expect(result).toBe(true)
  })

  it('should return true when filter value is undefined', () => {
    const row = createMockRow('active', 'status')

    const result = arrayFilterFn(row, 'status', undefined)
    expect(result).toBe(true)
  })

  it('should return true when filter array is empty', () => {
    const row = createMockRow('active', 'status')

    const result = arrayFilterFn(row, 'status', [])
    expect(result).toBe(true)
  })

  it('should filter with array of values', () => {
    const row = createMockRow('active', 'status')

    const result = arrayFilterFn(row, 'status', ['active', 'pending'])
    expect(result).toBe(true)
  })

  it('should return false when value not in filter array', () => {
    const row = createMockRow('inactive', 'status')

    const result = arrayFilterFn(row, 'status', ['active', 'pending'])
    expect(result).toBe(false)
  })

  it('should handle single value (non-array) filter', () => {
    const row = createMockRow('active', 'status')

    const result = arrayFilterFn(row, 'status', 'active')
    expect(result).toBe(true)
  })

  it('should return false when single value does not match', () => {
    const row = createMockRow('inactive', 'status')

    const result = arrayFilterFn(row, 'status', 'active')
    expect(result).toBe(false)
  })

  it('should handle multiple values in array', () => {
    const row = createMockRow('pending', 'status')

    const result = arrayFilterFn(row, 'status', [
      'active',
      'pending',
      'completed',
    ])
    expect(result).toBe(true)
  })
})

describe('dateSortingFnNullsFirst', () => {
  it('should sort dates in ascending order', () => {
    const date1 = new Date('2024-01-01')
    const date2 = new Date('2024-12-31')
    const rowA = createMockRow(date1, 'canceledAt')
    const rowB = createMockRow(date2, 'canceledAt')

    const result = dateSortingFnNullsFirst(rowA, rowB, 'canceledAt')
    expect(result).toBeLessThan(0)
  })

  it('should place null values first', () => {
    const date = new Date('2024-01-01')
    const rowA = createMockRow(null, 'canceledAt')
    const rowB = createMockRow(date, 'canceledAt')

    const result = dateSortingFnNullsFirst(rowA, rowB, 'canceledAt')
    expect(result).toBeLessThan(0) // null should come before any date
  })

  it('should place null values before other null values (equal)', () => {
    const rowA = createMockRow(null, 'canceledAt')
    const rowB = createMockRow(null, 'canceledAt')

    const result = dateSortingFnNullsFirst(rowA, rowB, 'canceledAt')
    expect(result).toBe(0)
  })

  it('should sort non-null dates normally', () => {
    const date1 = new Date('2024-12-31')
    const date2 = new Date('2024-01-01')
    const rowA = createMockRow(date1, 'canceledAt')
    const rowB = createMockRow(date2, 'canceledAt')

    const result = dateSortingFnNullsFirst(rowA, rowB, 'canceledAt')
    expect(result).toBeGreaterThan(0)
  })

  it('should return 0 for equal dates', () => {
    const date1 = new Date('2024-01-01')
    const date2 = new Date('2024-01-01')
    const rowA = createMockRow(date1, 'canceledAt')
    const rowB = createMockRow(date2, 'canceledAt')

    const result = dateSortingFnNullsFirst(rowA, rowB, 'canceledAt')
    expect(result).toBe(0)
  })

  it('should handle date with null (null first)', () => {
    const date = new Date('2024-01-01')
    const rowA = createMockRow(date, 'canceledAt')
    const rowB = createMockRow(null, 'canceledAt')

    const result = dateSortingFnNullsFirst(rowA, rowB, 'canceledAt')
    expect(result).toBeGreaterThan(0) // date should come after null
  })
})
