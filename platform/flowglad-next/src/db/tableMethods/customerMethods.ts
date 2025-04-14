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

  const dataByCustomerId = new Map<
    string,
    {
      totalSpend: number
      totalInvoices: number
      earliestPurchase?: Date
    }
  >(totalSpendAndcustomerId.map((cps) => [`${cps.customerId}`, cps]))

  return customerAndCustomer.map((row) => {
    const data = dataByCustomerId.get(`${row.customer.id}`)
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
      totalSpend: dataByCustomerId.get(`${row.customer.id}`)
        ?.totalSpend,
      payments: dataByCustomerId.get(`${row.customer.id}`)
        ?.totalInvoices,
      status,
    }
  })
}

export const upsertCustomerByEmailAndOrganizationId = async (
  customerInsert: Customer.Insert,
  transaction: DbTransaction
) => {
  const [existingCustomer] = await selectCustomers(
    {
      email: customerInsert.email,
      organizationId: customerInsert.organizationId,
      livemode: customerInsert.livemode,
    },
    transaction
  )
  if (existingCustomer) {
    return updateCustomer(
      {
        id: existingCustomer.id,
        ...customerInsert,
      },
      transaction
    )
  }
  return insertCustomer(customerInsert, transaction)
}

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

export const bulkInsertOrDoNothingCustomersByStripeCustomerId = (
  customerInserts: Customer.Insert[],
  transaction: DbTransaction
) => {
  return bulkInsertCustomersOrDoNothing(
    customerInserts,
    [customersTable.stripeCustomerId],
    transaction
  )
}

export const selectCustomersTableRowData = async (
  organizationId: string,
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
        eq(customersTable.organizationId, organizationId),
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
    .where(eq(customersTable.organizationId, organizationId))
    .orderBy(desc(customersTable.createdAt))

  const dataByCustomerId = new Map<
    string,
    {
      totalSpend: number
      totalInvoices: number
      earliestPurchase?: Date
    }
  >(totalSpendAndcustomerId.map((cps) => [`${cps.customerId}`, cps]))

  return customerAndCustomer.map((row) => {
    const data = dataByCustomerId.get(`${row.customer.id}`)
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
      totalSpend: Number(
        dataByCustomerId.get(`${row.customer.id}`)?.totalSpend ?? 0
      ),
      payments: Number(
        dataByCustomerId.get(`${row.customer.id}`)?.totalInvoices ?? 0
      ),
      status,
    }
  })
}
