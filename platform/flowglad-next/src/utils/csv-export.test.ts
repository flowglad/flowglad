import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createCustomersCsv } from '@/utils/csv-export'
import {
  CustomerTableRowData,
  InferredCustomerStatus,
} from '@/db/schema/customers'
import { CurrencyCode } from '@/types'

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

    // Create sample customer data that matches your schema
    mockCustomerTableRowData = [
      {
        customer: {
          id: 'cust_1',
          organizationId: 'org_1',
          email: 'john.doe@example.com',
          name: 'John Doe',
          externalId: 'ext_john_123',
          createdAt: new Date('2024-01-01T10:00:00.000Z').getTime(),
          updatedAt: new Date('2024-01-01T10:00:00.000Z').getTime(),
          archived: false,
          logoURL: null,
          iconURL: null,
          domain: null,
          billingAddress: null,
          userId: null,
          pricingModelId: null,
          invoiceNumberBase: 'INV001',
          livemode: true,
          createdByCommit: null,
          updatedByCommit: null,
          position: 1,
        },
        totalSpend: 12500, // $125.00 in cents
        payments: 3,
        status: InferredCustomerStatus.Active,
      },
      {
        customer: {
          id: 'cust_2',
          organizationId: 'org_1',
          email: 'jane.smith@example.com',
          name: 'Jane Smith',
          externalId: 'ext_jane_456',
          createdAt: new Date('2024-01-10T15:30:00.000Z').getTime(),
          updatedAt: new Date('2024-01-10T15:30:00.000Z').getTime(),
          archived: true,
          logoURL: null,
          iconURL: null,
          domain: null,
          billingAddress: null,
          userId: null,
          pricingModelId: null,
          invoiceNumberBase: 'INV002',
          livemode: true,
          createdByCommit: null,
          updatedByCommit: null,
          position: 2,
        },
        totalSpend: 0,
        payments: 0,
        status: InferredCustomerStatus.Archived,
      },
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
        '"John Doe","john.doe@example.com","$125.00","3","2024-01-01","cust_1","ext_john_123","Active"'
      )
      expect(secondDataRow).toBe(
        '"Jane Smith","jane.smith@example.com","$0.00","0","2024-01-10","cust_2","ext_jane_456","Archived"'
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
      const customerWithNulls: Partial<CustomerTableRowData> = {
        customer: {
          id: 'cust_null',
          organizationId: 'org_1',
          email: 'null@example.com',
          name: 'Null Customer',
          externalId: 'ext_null',
          createdAt: new Date('2024-01-01T10:00:00.000Z').getTime(),
          updatedAt: new Date('2024-01-01T10:00:00.000Z').getTime(),
          archived: false,
          logoURL: null,
          iconURL: null,
          domain: null,
          billingAddress: null,
          userId: null,
          pricingModelId: null,
          invoiceNumberBase: 'INV003',
          livemode: true,
          createdByCommit: null,
          updatedByCommit: null,
          position: 1,
        },
        totalSpend: undefined, // Testing undefined
        payments: undefined, // Testing undefined
        status: InferredCustomerStatus.Pending,
      }

      const result = createCustomersCsv(
        [customerWithNulls as CustomerTableRowData],
        CurrencyCode.USD,
        fixedDate
      )

      const lines = result.csv.split('\n')
      const dataRow = lines[1]

      expect(dataRow).toContain('"$0.00"') // totalSpend should default to 0
      expect(dataRow).toContain('"0"') // payments should default to 0
    })

    it('should properly escape CSV values containing quotes', () => {
      const customerWithQuotes: CustomerTableRowData = {
        customer: {
          id: 'cust_quotes',
          organizationId: 'org_1',
          email: 'quotes@example.com',
          name: 'Company "Name" Ltd.',
          externalId: 'ext_"quotes"',
          createdAt: new Date('2024-01-01T10:00:00.000Z').getTime(),
          updatedAt: new Date('2024-01-01T10:00:00.000Z').getTime(),
          archived: false,
          logoURL: null,
          iconURL: null,
          domain: null,
          billingAddress: null,
          userId: null,
          pricingModelId: null,
          invoiceNumberBase: 'INV004',
          livemode: true,
          createdByCommit: null,
          updatedByCommit: null,
          position: 4,
        },
        totalSpend: 5000,
        payments: 1,
        status: InferredCustomerStatus.Active,
      }

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
      const customerWithCommas: CustomerTableRowData = {
        customer: {
          id: 'cust_comma',
          organizationId: 'org_1',
          email: 'comma@example.com',
          name: 'Smith, John Jr.',
          externalId: 'ext_comma',
          createdAt: new Date('2024-01-01T10:00:00.000Z').getTime(),
          updatedAt: new Date('2024-01-01T10:00:00.000Z').getTime(),
          archived: false,
          logoURL: null,
          iconURL: null,
          domain: null,
          billingAddress: null,
          userId: null,
          pricingModelId: null,
          invoiceNumberBase: 'INV005',
          livemode: true,
          createdByCommit: null,
          updatedByCommit: null,
          position: 5,
        },
        totalSpend: 2500,
        payments: 1,
        status: InferredCustomerStatus.Active,
      }

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
      const largeAmountCustomer: CustomerTableRowData = {
        ...mockCustomerTableRowData[0],
        totalSpend: 999999999, // $9,999,999.99
      }

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
      expect(secondDataRow).toContain('"2024-01-10"')
    })

    it('should handle different date input types', () => {
      const customerWithStringDate: CustomerTableRowData = {
        ...mockCustomerTableRowData[0],
        customer: {
          ...mockCustomerTableRowData[0].customer,
          createdAt: new Date('2024-02-15T08:30:00.000Z').getTime(), // Convert string to timestamp
        },
      }

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
      const customerWithNullDate: CustomerTableRowData = {
        ...mockCustomerTableRowData[0],
        customer: {
          ...mockCustomerTableRowData[0].customer,
          createdAt: 0, // Use 0 to represent invalid/null timestamp
        },
      }

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
      const customersWithAllStatuses: CustomerTableRowData[] = [
        {
          ...mockCustomerTableRowData[0],
          status: InferredCustomerStatus.Active,
        },
        {
          ...mockCustomerTableRowData[0],
          customer: {
            ...mockCustomerTableRowData[0].customer,
            id: 'cust_pending',
          },
          status: InferredCustomerStatus.Pending,
        },
        {
          ...mockCustomerTableRowData[0],
          customer: {
            ...mockCustomerTableRowData[0].customer,
            id: 'cust_archived',
          },
          status: InferredCustomerStatus.Archived,
        },
      ]

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
        {
          customer: {
            id: 'cust_special',
            organizationId: 'org_1',
            email: 'test+special@example-company.co.uk',
            name: 'José María García-Rodríguez & Associates, Inc.',
            externalId: 'ext_special_123',
            createdAt: new Date('2024-01-05T14:22:33.000Z').getTime(),
            updatedAt: new Date('2024-01-05T14:22:33.000Z').getTime(),
            archived: false,
            logoURL: null,
            iconURL: null,
            domain: null,
            billingAddress: null,
            userId: null,
            pricingModelId: null,
            invoiceNumberBase: 'INV_SPECIAL',
            livemode: true,
            createdByCommit: null,
            updatedByCommit: null,
            position: 6,
          },
          totalSpend: 75050, // $750.50
          payments: 15,
          status: InferredCustomerStatus.Active,
        },
        // Customer with zero spend
        {
          customer: {
            id: 'cust_zero',
            organizationId: 'org_1',
            email: 'free@example.com',
            name: 'Free User',
            externalId: 'ext_free',
            createdAt: new Date('2024-01-12T09:15:00.000Z').getTime(),
            updatedAt: new Date('2024-01-12T09:15:00.000Z').getTime(),
            archived: false,
            logoURL: null,
            iconURL: null,
            domain: null,
            billingAddress: null,
            userId: null,
            pricingModelId: null,
            invoiceNumberBase: 'INV_FREE',
            livemode: true,
            createdByCommit: null,
            updatedByCommit: null,
            position: 7,
          },
          totalSpend: 0,
          payments: 0,
          status: InferredCustomerStatus.Pending,
        },
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
