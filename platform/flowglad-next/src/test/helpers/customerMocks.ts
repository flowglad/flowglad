import {
  type Customer,
  type CustomerTableRowData,
  InferredCustomerStatus,
} from '@db-core/schema/customers'
import core from '@/utils/core'

/**
 * Common mock functions for Customer objects used across tests
 * This avoids re-implementing the same mock functions in multiple test files
 */

export const createMockCustomer = (
  overrides: Partial<Customer.ClientRecord> = {}
): Customer.ClientRecord => {
  const id = `cust_${core.nanoid()}`
  const timestamp = new Date('2024-01-01T10:00:00.000Z').getTime()

  return {
    id,
    organizationId: 'org_1',
    email: `customer-${core.nanoid()}@example.com`,
    name: `Customer ${core.nanoid()}`,
    externalId: `ext_${core.nanoid()}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    archived: false,
    logoURL: null,
    iconURL: null,
    domain: null,
    billingAddress: null,
    userId: null,
    pricingModelId: `pricing_model_${core.nanoid()}`,
    invoiceNumberBase: `INV${core.nanoid()}`,
    livemode: true,
    createdByCommit: null,
    updatedByCommit: null,
    position: 1,
    ...overrides,
  }
}

export const createMockCustomerTableRowData = (
  overrides: {
    customer?: Partial<Customer.ClientRecord>
    totalSpend?: number
    payments?: number
    status?: InferredCustomerStatus
  } = {}
): CustomerTableRowData => {
  return {
    customer: createMockCustomer(overrides.customer),
    totalSpend:
      overrides.totalSpend !== undefined
        ? overrides.totalSpend
        : 12500, // $125.00 in cents
    payments:
      overrides.payments !== undefined ? overrides.payments : 3,
    status: overrides.status ?? InferredCustomerStatus.Active,
  }
}

/**
 * Creates multiple mock customer table row data entries
 */
export const createMockCustomerTableRowDataArray = (
  count: number,
  baseOverrides: {
    customer?: Partial<Customer.ClientRecord>
    totalSpend?: number
    payments?: number
    status?: InferredCustomerStatus
  } = {}
): CustomerTableRowData[] => {
  return Array.from({ length: count }, (_, index) => {
    const timestamp = new Date(
      `2024-01-${(index + 1).toString().padStart(2, '0')}T10:00:00.000Z`
    ).getTime()

    return createMockCustomerTableRowData({
      customer: {
        id: `cust_${index + 1}`,
        email: `customer${index + 1}@example.com`,
        name: `Customer ${index + 1}`,
        externalId: `ext_customer_${index + 1}`,
        createdAt: timestamp,
        updatedAt: timestamp,
        position: index + 1,
        ...baseOverrides.customer,
      },
      totalSpend: baseOverrides.totalSpend,
      payments: baseOverrides.payments,
      status: baseOverrides.status,
    })
  })
}

/**
 * Common customer test scenarios
 */
export const customerTestScenarios = {
  /** Customer with special characters in name and email */
  withSpecialCharacters: (): CustomerTableRowData =>
    createMockCustomerTableRowData({
      customer: {
        email: 'test+special@example-company.co.uk',
        name: 'José María García-Rodríguez & Associates, Inc.',
        externalId: 'ext_special_123',
      },
      totalSpend: 75050, // $750.50
      payments: 15,
      status: InferredCustomerStatus.Active,
    }),

  /** Customer with quotes in name and external ID */
  withQuotes: (): CustomerTableRowData =>
    createMockCustomerTableRowData({
      customer: {
        email: 'quotes@example.com',
        name: 'Company "Name" Ltd.',
        externalId: 'ext_"quotes"',
      },
      totalSpend: 5000,
      payments: 1,
      status: InferredCustomerStatus.Active,
    }),

  /** Customer with commas in name */
  withCommas: (): CustomerTableRowData =>
    createMockCustomerTableRowData({
      customer: {
        email: 'comma@example.com',
        name: 'Smith, John Jr.',
        externalId: 'ext_comma',
      },
      totalSpend: 2500,
      payments: 1,
      status: InferredCustomerStatus.Active,
    }),

  /** Customer with zero spend */
  withZeroSpend: (): CustomerTableRowData =>
    createMockCustomerTableRowData({
      customer: {
        email: 'free@example.com',
        name: 'Free User',
        externalId: 'ext_free',
      },
      totalSpend: 0,
      payments: 0,
      status: InferredCustomerStatus.Pending,
    }),

  /** Archived customer */
  archived: (): CustomerTableRowData =>
    createMockCustomerTableRowData({
      customer: {
        email: 'archived@example.com',
        name: 'Archived Customer',
        externalId: 'ext_archived',
        archived: true,
      },
      totalSpend: 0,
      payments: 0,
      status: InferredCustomerStatus.Archived,
    }),

  /** Customer with large amount */
  withLargeAmount: (): CustomerTableRowData =>
    createMockCustomerTableRowData({
      customer: {
        email: 'bigspender@example.com',
        name: 'Big Spender',
        externalId: 'ext_big',
      },
      totalSpend: 999999999, // $9,999,999.99
      payments: 50,
      status: InferredCustomerStatus.Active,
    }),

  /** Customer with undefined values (for edge case testing) */
  withUndefinedValues: (): CustomerTableRowData => ({
    customer: createMockCustomer({
      email: 'undefined@example.com',
      name: 'Undefined Customer',
      externalId: 'ext_undefined',
    }),
    totalSpend: undefined, // Explicitly undefined for testing
    payments: undefined, // Explicitly undefined for testing
    status: InferredCustomerStatus.Pending,
  }),

  /** Customer with invalid date (for edge case testing) */
  withInvalidDate: (): CustomerTableRowData =>
    createMockCustomerTableRowData({
      customer: {
        email: 'invalid@example.com',
        name: 'Invalid Date Customer',
        externalId: 'ext_invalid',
        createdAt: 0, // Invalid timestamp
      },
      totalSpend: 1000,
      payments: 1,
      status: InferredCustomerStatus.Active,
    }),
}

/**
 * Creates a set of customers representing all possible statuses
 */
export const createCustomersWithAllStatuses =
  (): CustomerTableRowData[] => [
    createMockCustomerTableRowData({
      customer: { id: 'cust_active' },
      status: InferredCustomerStatus.Active,
    }),
    createMockCustomerTableRowData({
      customer: { id: 'cust_pending' },
      status: InferredCustomerStatus.Pending,
    }),
    createMockCustomerTableRowData({
      customer: { id: 'cust_archived' },
      status: InferredCustomerStatus.Archived,
    }),
  ]
