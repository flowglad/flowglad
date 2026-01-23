import { beforeEach, describe, expect, it } from 'bun:test'
import {
  type CustomerTableRowData,
  InferredCustomerStatus,
} from '@/db/schema/customers'
import {
  createCustomersWithAllStatuses,
  createMockCustomerTableRowData,
  customerTestScenarios,
} from '@/test/helpers/customerMocks'
import { CurrencyCode } from '@/types'
import { createCustomersCsv } from '@/utils/csv-export'

describe('createCustomersCsv', () => {
  let mockCustomerTableRowData: CustomerTableRowData[]
  let fixedDate: Date

  beforeEach(() => {
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
    it('should generate CSV with correct format, headers, data, and filename', () => {
      const result = createCustomersCsv(
        mockCustomerTableRowData,
        CurrencyCode.USD,
        fixedDate
      )

      // Assert return structure
      expect(result).toHaveProperty('csv')
      expect(result).toHaveProperty('filename')
      expect(typeof result.csv).toBe('string')
      expect(typeof result.filename).toBe('string')

      // Assert filename format
      expect(result.filename).toBe('customers_2024-01-15.csv')

      // Assert CSV headers (snake_case)
      const lines = result.csv.split('\n')
      const headers = lines[0]
      expect(headers).toBe(
        '"name","email","total_spend","payments","created_date","customer_id","external_id","status"'
      )

      // Assert CSV data rows are formatted correctly
      const firstDataRow = lines[1]
      const secondDataRow = lines[2]
      expect(firstDataRow).toBe(
        '"Customer 1","customer1@example.com","$125.00","3","2024-01-01","cust_1","ext_customer_1","Active"'
      )
      expect(secondDataRow).toBe(
        '"Customer 2","customer2@example.com","$0.00","0","2024-01-02","cust_2","ext_customer_2","Archived"'
      )
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
        '"name","email","total_spend","payments","created_date","customer_id","external_id","status"'
      )
    })

    it('should handle all edge cases: null/undefined values, quote escaping, and commas', () => {
      const customerWithNulls =
        customerTestScenarios.withUndefinedValues()
      const customerWithQuotes = customerTestScenarios.withQuotes()
      const customerWithCommas = customerTestScenarios.withCommas()

      // Test null/undefined values
      const nullsResult = createCustomersCsv(
        [customerWithNulls],
        CurrencyCode.USD,
        fixedDate
      )
      const nullsLines = nullsResult.csv.split('\n')
      const nullsDataRow = nullsLines[1]
      expect(nullsDataRow).toContain('"$0.00"') // totalSpend should default to 0
      expect(nullsDataRow).toContain('"0"') // payments should default to 0

      // Test quote escaping
      const quotesResult = createCustomersCsv(
        [customerWithQuotes],
        CurrencyCode.USD,
        fixedDate
      )
      const quotesLines = quotesResult.csv.split('\n')
      const quotesDataRow = quotesLines[1]
      expect(quotesDataRow).toContain('"Company ""Name"" Ltd."') // Quotes should be escaped as double quotes
      expect(quotesDataRow).toContain('"ext_""quotes"""')

      // Test comma handling
      const commasResult = createCustomersCsv(
        [customerWithCommas],
        CurrencyCode.USD,
        fixedDate
      )
      const commasLines = commasResult.csv.split('\n')
      const commasDataRow = commasLines[1]
      expect(commasDataRow).toContain('"Smith, John Jr."') // Commas should be properly escaped within quotes
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

      expect(dataRow).toContain('"$9,999,999.99"')
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
