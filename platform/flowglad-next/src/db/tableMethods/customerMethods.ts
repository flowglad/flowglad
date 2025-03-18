import {
  Customer,
  customers as customersTable,
  customersInsertSchema,
  customersSelectSchema,
  customersUpdateSchema,
  InferredCustomerStatus,
  type CustomerTableRowData,
} from '@/db/schema/customers'
import {
  createUpsertFunction,
  createSelectById,
  createSelectFunction,
  createInsertFunction,
  createUpdateFunction,
  ORMMethodCreatorConfig,
  whereClauseFromObject,
  createBulkInsertOrDoNothingFunction,
  createPaginatedSelectFunction,
} from '@/db/tableUtils'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { PaymentStatus } from '@/types'
import { DbTransaction } from '@/db/types'
import { invoices } from '../schema/invoices'
import { payments } from '../schema/payments'
import { purchases } from '../schema/purchases'

const config: ORMMethodCreatorConfig<
  typeof customersTable,
  typeof customersSelectSchema,
  typeof customersInsertSchema,
  typeof customersUpdateSchema
> = {
  selectSchema: customersSelectSchema,
  insertSchema: customersInsertSchema,
  updateSchema: customersUpdateSchema,
}

export const selectCustomerById = createSelectById(
  customersTable,
  config
)

export const upsertCustomerByorganizationIdAndInvoiceNumberBase =
  createUpsertFunction(
    customersTable,
    [customersTable.organizationId, customersTable.invoiceNumberBase],
    config
  )

export const selectCustomers = createSelectFunction(
  customersTable,
  config
)

export const insertCustomer = createInsertFunction(
  customersTable,
  config
)

export const updateCustomer = createUpdateFunction(
  customersTable,
  config
)

export const selectCustomerAndCustomerFromCustomerWhere = async (
  whereConditions: Partial<Customer.Record>,
  transaction: DbTransaction
) => {
  const result = await transaction
    .select({
      customer: customersTable,
    })
    .from(customersTable)
    .where(whereClauseFromObject(customersTable, whereConditions))
  return result.map((row) => ({
    customer: customersSelectSchema.parse(row.customer),
  }))
}

export const selectCustomerAndCustomerTableRows = async (
  whereConditions: Partial<Customer.Record>,
  transaction: DbTransaction
): Promise<CustomerTableRowData[]> => {
  /**
   * These will be used to derive the status
   */
  const totalSpendAndcustomerId = await transaction
    .select({
      customerId: customersTable.id,
      totalSpend: sql<number>`SUM(${payments.amount})`,
      totalInvoices: sql<number>`COUNT(${invoices.id})`,
      earliestPurchase: sql<Date>`MIN(${purchases.purchaseDate})`,
    })
    .from(customersTable)
    .leftJoin(invoices, eq(customersTable.id, invoices.customerId))
    .leftJoin(payments, eq(invoices.id, payments.invoiceId))
    .leftJoin(purchases, eq(customersTable.id, purchases.customerId))
    .where(
      and(
        whereClauseFromObject(customersTable, whereConditions),
        inArray(payments.status, [
          PaymentStatus.Succeeded,
          PaymentStatus.Processing,
        ])
      )
    )
    .groupBy(customersTable.id)

  const customerAndCustomer = await transaction
    .select({
      customer: customersTable,
    })
    .from(customersTable)
    .where(whereClauseFromObject(customersTable, whereConditions))
    .orderBy(desc(customersTable.createdAt))

  const dataBycustomerId = new Map<
    string,
    {
      totalSpend: number
      totalInvoices: number
      earliestPurchase?: Date
    }
  >(totalSpendAndcustomerId.map((cps) => [`${cps.customerId}`, cps]))

  return customerAndCustomer.map((row) => {
    const data = dataBycustomerId.get(`${row.customer.id}`)
    let status: InferredCustomerStatus = InferredCustomerStatus.Active
    if (row.customer.archived) {
      status = InferredCustomerStatus.Archived
    } else if (!data?.earliestPurchase) {
      status = InferredCustomerStatus.Pending
    }
    // TODO: else / if for customers with purchases that have ended
    // TODO: else / if for customers with unpaid invoices
    return {
      customer: customersSelectSchema.parse(row.customer),
      totalSpend: dataBycustomerId.get(`${row.customer.id}`)
        ?.totalSpend,
      payments: dataBycustomerId.get(`${row.customer.id}`)
        ?.totalInvoices,
      status,
    }
  })
}

export const upsertCustomerByEmailAndOrganizationId =
  createUpsertFunction(
    customersTable,
    [customersTable.email, customersTable.organizationId],
    config
  )

const bulkInsertCustomersOrDoNothing =
  createBulkInsertOrDoNothingFunction(customersTable, config)

export const bulkInsertOrDoNothingCustomersByCustomerIdAndOrganizationId =
  (customers: Customer.Insert[], transaction: DbTransaction) => {
    return bulkInsertCustomersOrDoNothing(
      customers,
      [customersTable.organizationId],
      transaction
    )
  }

export const selectCustomersByOrganizationIdAndEmails = async (
  organizationId: string,
  emails: string[],
  transaction: DbTransaction
) => {
  const result = await transaction
    .select()
    .from(customersTable)
    .where(
      and(
        eq(customersTable.organizationId, organizationId),
        inArray(customersTable.email, emails)
      )
    )
  return result.map((row) => customersSelectSchema.parse(row))
}

export const selectCustomersPaginated = createPaginatedSelectFunction(
  customersTable,
  config
)
