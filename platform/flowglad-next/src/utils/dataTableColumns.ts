/**
 * Reusable utilities for data table column definitions
 * Provides common sorting and filtering functions to reduce code duplication
 */

import { Row } from '@tanstack/react-table'

/**
 * Generic string sorting function for columns
 * Handles null/undefined values by treating them as empty strings
 */
export function stringSortingFn<T>(
  rowA: Row<T>,
  rowB: Row<T>,
  columnId: string
): number {
  const valueA = rowA.getValue<string>(columnId) ?? ''
  const valueB = rowB.getValue<string>(columnId) ?? ''
  return valueA.localeCompare(valueB)
}

/**
 * Generic string filter function for columns
 * Performs case-insensitive substring matching
 */
export function stringFilterFn<T>(
  row: Row<T>,
  columnId: string,
  filterValue: unknown
): boolean {
  if (!filterValue || typeof filterValue !== 'string') {
    return true
  }
  const value = (row.getValue<string>(columnId) ?? '').toLowerCase()
  const search = filterValue.toLowerCase().trim()
  if (search.length === 0) {
    return true
  }
  return value.includes(search)
}

/**
 * Generic date sorting function for columns
 * Handles Date objects, strings, and null values
 */
export function dateSortingFn<T>(
  rowA: Row<T>,
  rowB: Row<T>,
  columnId: string
): number {
  const dateA = rowA.getValue<Date | string | null>(columnId)
  const dateB = rowB.getValue<Date | string | null>(columnId)
  const timeA = dateA ? new Date(dateA).getTime() : 0
  const timeB = dateB ? new Date(dateB).getTime() : 0
  return timeA - timeB
}

/**
 * Generic number sorting function for columns
 * Handles numeric values and string representations
 */
export function numberSortingFn<T>(
  rowA: Row<T>,
  rowB: Row<T>,
  columnId: string
): number {
  const valueA = rowA.getValue<number | string | undefined>(columnId)
  const valueB = rowB.getValue<number | string | undefined>(columnId)

  const numA =
    typeof valueA === 'number'
      ? valueA
      : parseFloat((valueA ?? '0') as string)
  const numB =
    typeof valueB === 'number'
      ? valueB
      : parseFloat((valueB ?? '0') as string)

  return numA - numB
}

/**
 * Generic array-based filter function for columns
 * Supports filtering by multiple values (e.g., for status badges)
 */
export function arrayFilterFn<T>(
  row: Row<T>,
  columnId: string,
  filterValue: unknown
): boolean {
  if (!filterValue) {
    return true
  }
  const value = row.getValue<string>(columnId)
  if (Array.isArray(filterValue)) {
    if (filterValue.length === 0) {
      return true
    }
    return filterValue.includes(value)
  }
  return value === filterValue
}

/**
 * Date sorting function that treats null values as -Infinity
 * Useful when you want null dates to appear first when sorting ascending
 */
export function dateSortingFnNullsFirst<T>(
  rowA: Row<T>,
  rowB: Row<T>,
  columnId: string
): number {
  const dateA = rowA.getValue<Date | null>(columnId)
  const dateB = rowB.getValue<Date | null>(columnId)

  // Handle null values
  if (!dateA && !dateB) return 0
  if (!dateA) return -1
  if (!dateB) return 1

  const timeA = new Date(dateA).getTime()
  const timeB = new Date(dateB).getTime()
  return timeA - timeB
}
