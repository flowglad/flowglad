import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createCustomersCsv } from '@/utils/csv-export'
import {
  CustomerTableRowData,
  InferredCustomerStatus,
} from '@/db/schema/customers'
import { CurrencyCode } from '@/types'
import {
  createMockCustomerTableRowDataArray,
  createMockCustomerTableRowData,
  customerTestScenarios,
  createCustomersWithAllStatuses,
} from '@/test/helpers/customerMocks'

// Mock the stripe currency function
vi.mock('@/utils/stripe', () => ({
  stripeCurrencyAmountToHumanReadableCurrencyAmount: vi.fn(
    (currency: CurrencyCode, amount: number) => {
      // Simple mock that returns formatted currency like $10.50
      const formatted = (amount / 100).toFixed(2)
      const symbol =
        currency === CurrencyCode.USD
          ? '$'
          : currency === CurrencyCode.EUR
            ? '€'
            : currency
      return `${symbol}${formatted}`
    }
  ),
}))

describe('createCustomersCsv', () => {
  let mockCustomerTableRowData: CustomerTableRowData[]
  let fixedDate: Date

  beforeEach(() => {
    vi.clearAllMocks()

    // Use a fixed date for consistent test results
    fixedDate = new Date('2024-01-15T12:00:00.000Z')

    // Create sample customer data using the helper - create specific test data
    mockCustomerTableRowData = [
      createMockCustomerTableRowData({
        customer: {
          id: 'cust_1',
          email: 'customer1@example.com',
          name: 'Customer 1',
          externalId: 'ext_customer_1',
          createdAt: new Date('2024-01-01T10:00:00.000Z').getTime(),
          position: 1,
        },
        totalSpend: 12500, // $125.00 in cents
        payments: 3,
        status: InferredCustomerStatus.Active,
      }),
      createMockCustomerTableRowData({
        customer: {
          id: 'cust_2',
          email: 'customer2@example.com',
          name: 'Customer 2',
          externalId: 'ext_customer_2',
          createdAt: new Date('2024-01-02T10:00:00.000Z').getTime(),
          position: 2,
          archived: true,
        },
        totalSpend: 0,
        payments: 0,
        status: InferredCustomerStatus.Archived,
      }),
    ]
  })

  describe('Basic Functionality', () => {
    it('should generate CSV with correct headers', () => {
      const result = createCustomersCsv(
        mockCustomerTableRowData,
        CurrencyCode.USD,
        fixedDate
      )

      const lines = result.csv.split('\n')
      const headers = lines[0]

      expect(headers).toBe(
        '"Name","Email","Total Spend","Payments","Created Date","Customer ID","External ID","Status"'
      )
    })

    it('should generate correct filename with timestamp', () => {
      const result = createCustomersCsv(
        mockCustomerTableRowData,
        CurrencyCode.USD,
        fixedDate
      )

      expect(result.filename).toBe('customers_2024-01-15.csv')
    })

    it('should format customer data correctly in CSV rows', () => {
      const result = createCustomersCsv(
        mockCustomerTableRowData,
        CurrencyCode.USD,
        fixedDate
      )

      const lines = result.csv.split('\n')
      const firstDataRow = lines[1]
      const secondDataRow = lines[2]

      expect(firstDataRow).toBe(
        '"Customer 1","customer1@example.com","$125.00","3","2024-01-01","cust_1","ext_customer_1","Active"'
      )
      expect(secondDataRow).toBe(
        '"Customer 2","customer2@example.com","$0.00","0","2024-01-02","cust_2","ext_customer_2","Archived"'
      )
    })

    it('should return both csv content and filename', () => {
      const result = createCustomersCsv(
        mockCustomerTableRowData,
        CurrencyCode.USD,
        fixedDate
      )

      expect(result).toHaveProperty('csv')
      expect(result).toHaveProperty('filename')
      expect(typeof result.csv).toBe('string')
      expect(typeof result.filename).toBe('string')
    })
  })

  describe('Edge Cases & Validation', () => {
    it('should handle empty customer array', () => {
      const result = createCustomersCsv(
        [],
        CurrencyCode.USD,
        fixedDate
      )

      const lines = result.csv.split('\n')
      expect(lines).toHaveLength(1) // Only headers
      expect(lines[0]).toBe(
        '"Name","Email","Total Spend","Payments","Created Date","Customer ID","External ID","Status"'
      )
    })

    it('should handle customers with null/undefined values', () => {
      const customerWithNulls =
        customerTestScenarios.withUndefinedValues()

      const result = createCustomersCsv(
        [customerWithNulls],
        CurrencyCode.USD,
        fixedDate
      )

      const lines = result.csv.split('\n')
      const dataRow = lines[1]

      expect(dataRow).toContain('"$0.00"') // totalSpend should default to 0
      expect(dataRow).toContain('"0"') // payments should default to 0
    })

    it('should properly escape CSV values containing quotes', () => {
      const customerWithQuotes = customerTestScenarios.withQuotes()

      const result = createCustomersCsv(
        [customerWithQuotes],
        CurrencyCode.USD,
        fixedDate
      )

      const lines = result.csv.split('\n')
      const dataRow = lines[1]

      // Quotes should be escaped as double quotes
      expect(dataRow).toContain('"Company ""Name"" Ltd."')
      expect(dataRow).toContain('"ext_""quotes"""')
    })

    it('should handle customers with commas in names', () => {
      const customerWithCommas = customerTestScenarios.withCommas()

      const result = createCustomersCsv(
        [customerWithCommas],
        CurrencyCode.USD,
        fixedDate
      )

      const lines = result.csv.split('\n')
      const dataRow = lines[1]

      // Commas should be properly escaped within quotes
      expect(dataRow).toContain('"Smith, John Jr."')
    })
  })

  describe('Currency Formatting', () => {
    it('should format USD currency correctly', () => {
      const result = createCustomersCsv(
        mockCustomerTableRowData,
        CurrencyCode.USD,
        fixedDate
      )

      const lines = result.csv.split('\n')
      const firstDataRow = lines[1]

      expect(firstDataRow).toContain('"$125.00"')
    })

    it('should format EUR currency correctly', () => {
      const result = createCustomersCsv(
        mockCustomerTableRowData,
        CurrencyCode.EUR,
        fixedDate
      )

      const lines = result.csv.split('\n')
      const firstDataRow = lines[1]

      expect(firstDataRow).toContain('"€125.00"')
    })

    it('should handle zero amounts correctly', () => {
      const result = createCustomersCsv(
        mockCustomerTableRowData,
        CurrencyCode.USD,
        fixedDate
      )

      const lines = result.csv.split('\n')
      const secondDataRow = lines[2] // Jane Smith with $0

      expect(secondDataRow).toContain('"$0.00"')
    })

    it('should handle large amounts correctly', () => {
      const largeAmountCustomer =
        customerTestScenarios.withLargeAmount()

      const result = createCustomersCsv(
        [largeAmountCustomer],
        CurrencyCode.USD,
        fixedDate
      )

      const lines = result.csv.split('\n')
      const dataRow = lines[1]

      expect(dataRow).toContain('"$9999999.99"')
    })
  })

  describe('Date Formatting', () => {
    it('should format dates consistently', () => {
      const result = createCustomersCsv(
        mockCustomerTableRowData,
        CurrencyCode.USD,
        fixedDate
      )

      const lines = result.csv.split('\n')
      const firstDataRow = lines[1]
      const secondDataRow = lines[2]

      expect(firstDataRow).toContain('"2024-01-01"')
      expect(secondDataRow).toContain('"2024-01-02"')
    })

    it('should handle different date input types', () => {
      const customerWithStringDate = createMockCustomerTableRowData({
        customer: {
          createdAt: new Date('2024-02-15T08:30:00.000Z').getTime(),
        },
      })

      const result = createCustomersCsv(
        [customerWithStringDate],
        CurrencyCode.USD,
        fixedDate
      )

      const lines = result.csv.split('\n')
      const dataRow = lines[1]

      expect(dataRow).toContain('"2024-02-15"')
    })

    it('should handle undefined/null dates gracefully', () => {
      const customerWithNullDate =
        customerTestScenarios.withInvalidDate()

      const result = createCustomersCsv(
        [customerWithNullDate],
        CurrencyCode.USD,
        fixedDate
      )

      const lines = result.csv.split('\n')
      const dataRow = lines[1]

      expect(dataRow).toContain('""') // Empty quoted value for invalid timestamp
    })
  })

  describe('Status Handling', () => {
    it('should include all customer status types', () => {
      const customersWithAllStatuses =
        createCustomersWithAllStatuses()

      const result = createCustomersCsv(
        customersWithAllStatuses,
        CurrencyCode.USD,
        fixedDate
      )

      const lines = result.csv.split('\n')

      expect(lines[1]).toContain('"Active"')
      expect(lines[2]).toContain('"Pending"')
      expect(lines[3]).toContain('"Archived"')
    })
  })

  describe('Data Integrity', () => {
    it('should not modify the original input data', () => {
      // Create a deep copy that preserves Date objects (not JSON serialization)
      const originalData = structuredClone(mockCustomerTableRowData)

      createCustomersCsv(
        mockCustomerTableRowData,
        CurrencyCode.USD,
        fixedDate
      )

      expect(mockCustomerTableRowData).toEqual(originalData)
    })

    it('should generate consistent output for same input', () => {
      const result1 = createCustomersCsv(
        mockCustomerTableRowData,
        CurrencyCode.USD,
        fixedDate
      )
      const result2 = createCustomersCsv(
        mockCustomerTableRowData,
        CurrencyCode.USD,
        fixedDate
      )

      expect(result1.csv).toBe(result2.csv)
      expect(result1.filename).toBe(result2.filename)
    })
  })

  describe('Real-world Scenarios', () => {
    it('should handle mixed customer data with various edge cases', () => {
      const mixedCustomerData: CustomerTableRowData[] = [
        // Normal customer
        mockCustomerTableRowData[0],
        // Customer with special characters in name and email
        customerTestScenarios.withSpecialCharacters(),
        // Customer with zero spend
        customerTestScenarios.withZeroSpend(),
      ]

      const result = createCustomersCsv(
        mixedCustomerData,
        CurrencyCode.USD,
        fixedDate
      )

      const lines = result.csv.split('\n')
      expect(lines).toHaveLength(4) // Header + 3 data rows

      // Check that special characters are properly escaped
      expect(lines[2]).toContain(
        '"José María García-Rodríguez & Associates, Inc."'
      )
      expect(lines[2]).toContain(
        '"test+special@example-company.co.uk"'
      )
      expect(lines[2]).toContain('"$750.50"')

      // Check zero spend customer
      expect(lines[3]).toContain('"Free User"')
      expect(lines[3]).toContain('"$0.00"')
      expect(lines[3]).toContain('"Pending"')
    })
  })

  describe('Default Parameter Behavior', () => {
    it('should use USD as default currency when not specified', () => {
      const result = createCustomersCsv(mockCustomerTableRowData)

      const lines = result.csv.split('\n')
      const firstDataRow = lines[1]

      expect(firstDataRow).toContain('"$125.00"') // Should use $ for USD
    })
  })
})
