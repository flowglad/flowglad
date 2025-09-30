import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import type { Table } from '@tanstack/react-table'
import { DataTablePagination } from '../data-table-pagination'

// Mock Lucide React icons
vi.mock('lucide-react', () => ({
  ChevronLeft: () => (
    <div data-testid="chevron-left">ChevronLeft</div>
  ),
  ChevronRight: () => (
    <div data-testid="chevron-right">ChevronRight</div>
  ),
}))

// Mock UI components
vi.mock('../button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={props['data-testid']}
      {...props}
    >
      {children}
    </button>
  ),
}))

vi.mock('../select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div
      data-testid="select"
      data-value={value}
      onClick={() => onValueChange?.('20')}
    >
      {children}
    </div>
  ),
  SelectContent: ({ children }: any) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectItem: ({ children, value }: any) => (
    <div data-testid="select-item" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => (
    <div data-testid="select-trigger">{children}</div>
  ),
  SelectValue: ({ placeholder }: any) => (
    <div data-testid="select-value">{placeholder}</div>
  ),
}))

// Create a mock table with the necessary methods
const createMockTable = (
  overrides: Partial<Table<any>> = {}
): Table<any> => {
  const mockFilteredRowModel = {
    rows: Array(5)
      .fill(null)
      .map((_, i) => ({ id: i })),
  }

  const mockPaginationState = {
    pageIndex: 0,
    pageSize: 10,
  }

  return {
    getFilteredRowModel: vi.fn(() => mockFilteredRowModel),
    getState: vi.fn(() => ({ pagination: mockPaginationState })),
    setPageSize: vi.fn(),
    previousPage: vi.fn(),
    nextPage: vi.fn(),
    getCanPreviousPage: vi.fn(() => false),
    getCanNextPage: vi.fn(() => true),
    ...overrides,
  } as any
}

describe('DataTablePagination - Unit Tests', () => {
  let mockTable: Table<any>

  beforeEach(() => {
    mockTable = createMockTable()
  })

  describe('Count Prioritization Logic', () => {
    it('should prioritize filteredCount when isFiltered=true and filteredCount is provided', () => {
      render(
        <DataTablePagination
          table={mockTable}
          totalCount={100}
          isFiltered={true}
          filteredCount={25}
        />
      )

      expect(screen.getByText('25 results')).toBeInTheDocument()
    })

    it('should use totalCount when isFiltered=false and totalCount is provided', () => {
      render(
        <DataTablePagination
          table={mockTable}
          totalCount={100}
          isFiltered={false}
          filteredCount={25}
        />
      )

      expect(screen.getByText('100 results')).toBeInTheDocument()
    })

    it('should use totalCount when filteredCount is not provided', () => {
      render(
        <DataTablePagination
          table={mockTable}
          totalCount={100}
          isFiltered={true}
        />
      )

      expect(screen.getByText('100 results')).toBeInTheDocument()
    })

    it('should fallback to client-side count when neither totalCount nor filteredCount are provided', () => {
      render(
        <DataTablePagination table={mockTable} isFiltered={false} />
      )

      expect(screen.getByText('5 results')).toBeInTheDocument()
    })

    it('should prioritize filteredCount over totalCount when both are provided and isFiltered=true', () => {
      render(
        <DataTablePagination
          table={mockTable}
          totalCount={1000}
          isFiltered={true}
          filteredCount={50}
        />
      )

      expect(screen.getByText('50 results')).toBeInTheDocument()
      expect(
        screen.queryByText('1000 results')
      ).not.toBeInTheDocument()
    })

    it('should ignore filteredCount when isFiltered=false', () => {
      render(
        <DataTablePagination
          table={mockTable}
          totalCount={200}
          isFiltered={false}
          filteredCount={30}
        />
      )

      expect(screen.getByText('200 results')).toBeInTheDocument()
      expect(screen.queryByText('30 results')).not.toBeInTheDocument()
    })
  })

  describe('Pagination Visibility Logic', () => {
    it('should hide pagination when totalRows <= 10 (using filteredCount)', () => {
      render(
        <DataTablePagination
          table={mockTable}
          totalCount={100}
          isFiltered={true}
          filteredCount={8}
        />
      )

      expect(screen.getByText('8 results')).toBeInTheDocument()
      expect(
        screen.queryByTestId('chevron-left')
      ).not.toBeInTheDocument()
      expect(
        screen.queryByTestId('chevron-right')
      ).not.toBeInTheDocument()
      expect(
        screen.queryByText('Rows per page')
      ).not.toBeInTheDocument()
    })

    it('should hide pagination when totalRows = 10 (boundary case)', () => {
      render(
        <DataTablePagination
          table={mockTable}
          totalCount={10}
          isFiltered={false}
        />
      )

      expect(screen.getByText('10 results')).toBeInTheDocument()
      expect(
        screen.queryByTestId('chevron-left')
      ).not.toBeInTheDocument()
      expect(
        screen.queryByTestId('chevron-right')
      ).not.toBeInTheDocument()
      expect(
        screen.queryByText('Rows per page')
      ).not.toBeInTheDocument()
    })

    it('should show pagination when totalRows > 10', () => {
      render(
        <DataTablePagination
          table={mockTable}
          totalCount={50}
          isFiltered={false}
        />
      )

      expect(screen.getByText('50 results')).toBeInTheDocument()
      expect(screen.getByTestId('chevron-left')).toBeInTheDocument()
      expect(screen.getByTestId('chevron-right')).toBeInTheDocument()
      expect(screen.getByText('Rows per page')).toBeInTheDocument()
    })

    it('should show pagination when client-side count > 10', () => {
      const rows = Array(15)
        .fill(null)
        .map((_, i) => ({ id: i }))
      const tableWithManyRows = createMockTable({
        getFilteredRowModel: vi.fn(() => ({
          rows,
          flatRows: rows,
          rowsById: rows.reduce(
            (acc, row, idx) => ({ ...acc, [idx]: row }),
            {}
          ),
        })) as any,
      })

      render(
        <DataTablePagination
          table={tableWithManyRows}
          isFiltered={false}
        />
      )

      expect(screen.getByText('15 results')).toBeInTheDocument()
      expect(screen.getByTestId('chevron-left')).toBeInTheDocument()
      expect(screen.getByTestId('chevron-right')).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero counts gracefully', () => {
      render(
        <DataTablePagination
          table={mockTable}
          totalCount={0}
          isFiltered={false}
        />
      )

      expect(screen.getByText('0 results')).toBeInTheDocument()
      expect(
        screen.queryByTestId('chevron-left')
      ).not.toBeInTheDocument()
    })

    it('should handle zero filteredCount when filtered', () => {
      render(
        <DataTablePagination
          table={mockTable}
          totalCount={100}
          isFiltered={true}
          filteredCount={0}
        />
      )

      expect(screen.getByText('0 results')).toBeInTheDocument()
      expect(
        screen.queryByTestId('chevron-left')
      ).not.toBeInTheDocument()
    })

    it('should handle undefined/null filteredCount gracefully', () => {
      render(
        <DataTablePagination
          table={mockTable}
          totalCount={50}
          isFiltered={true}
          filteredCount={undefined}
        />
      )

      expect(screen.getByText('50 results')).toBeInTheDocument()
    })

    it('should handle empty client-side rows', () => {
      const tableWithNoRows = createMockTable({
        getFilteredRowModel: vi.fn(() => ({
          rows: [],
          flatRows: [],
          rowsById: {},
        })) as any,
      })

      render(
        <DataTablePagination
          table={tableWithNoRows}
          isFiltered={false}
        />
      )

      expect(screen.getByText('0 results')).toBeInTheDocument()
      expect(
        screen.queryByTestId('chevron-left')
      ).not.toBeInTheDocument()
    })
  })

  describe('Pagination Controls', () => {
    it('should render page size selector when pagination is visible', () => {
      render(
        <DataTablePagination
          table={mockTable}
          totalCount={50}
          isFiltered={false}
        />
      )

      expect(screen.getByText('Rows per page')).toBeInTheDocument()
      expect(screen.getByTestId('select')).toBeInTheDocument()
    })

    it('should call setPageSize when page size is changed', () => {
      const setPageSizeMock = vi.fn()
      const tableWithMockSetPageSize = createMockTable({
        setPageSize: setPageSizeMock,
      })

      render(
        <DataTablePagination
          table={tableWithMockSetPageSize}
          totalCount={50}
          isFiltered={false}
        />
      )

      const select = screen.getByTestId('select')
      fireEvent.click(select)

      expect(setPageSizeMock).toHaveBeenCalledWith(20)
    })

    it('should disable previous button when cannot go to previous page', () => {
      const tableWithNoPrevious = createMockTable({
        getCanPreviousPage: vi.fn(() => false),
      })

      render(
        <DataTablePagination
          table={tableWithNoPrevious}
          totalCount={50}
          isFiltered={false}
        />
      )

      const previousButton = screen
        .getByTestId('chevron-left')
        .closest('button')
      expect(previousButton).toBeDisabled()
    })

    it('should disable next button when cannot go to next page', () => {
      const tableWithNoNext = createMockTable({
        getCanNextPage: vi.fn(() => false),
      })

      render(
        <DataTablePagination
          table={tableWithNoNext}
          totalCount={50}
          isFiltered={false}
        />
      )

      const nextButton = screen
        .getByTestId('chevron-right')
        .closest('button')
      expect(nextButton).toBeDisabled()
    })

    it('should call previousPage when previous button is clicked', () => {
      const previousPageMock = vi.fn()
      const tableWithPreviousPage = createMockTable({
        getCanPreviousPage: vi.fn(() => true),
        previousPage: previousPageMock,
      })

      render(
        <DataTablePagination
          table={tableWithPreviousPage}
          totalCount={50}
          isFiltered={false}
        />
      )

      const previousButton = screen
        .getByTestId('chevron-left')
        .closest('button')
      fireEvent.click(previousButton!)

      expect(previousPageMock).toHaveBeenCalled()
    })

    it('should call nextPage when next button is clicked', () => {
      const nextPageMock = vi.fn()
      const tableWithNextPage = createMockTable({
        nextPage: nextPageMock,
      })

      render(
        <DataTablePagination
          table={tableWithNextPage}
          totalCount={50}
          isFiltered={false}
        />
      )

      const nextButton = screen
        .getByTestId('chevron-right')
        .closest('button')
      fireEvent.click(nextButton!)

      expect(nextPageMock).toHaveBeenCalled()
    })
  })

  describe('Memoization Behavior', () => {
    it('should recalculate totalRows when dependencies change', () => {
      const { rerender } = render(
        <DataTablePagination
          table={mockTable}
          totalCount={100}
          isFiltered={false}
        />
      )

      expect(screen.getByText('100 results')).toBeInTheDocument()

      // Change props that should trigger recalculation
      rerender(
        <DataTablePagination
          table={mockTable}
          totalCount={100}
          isFiltered={true}
          filteredCount={50}
        />
      )

      expect(screen.getByText('50 results')).toBeInTheDocument()
    })
  })
})
