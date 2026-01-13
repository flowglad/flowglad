import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  type Customer,
  type CustomerTableRowData,
  customers,
  customersInsertSchema,
  customersPaginatedTableRowDataSchema,
  customersSelectSchema,
  customers as customersTable,
  customersUpdateSchema,
  InferredCustomerStatus,
} from '@/db/schema/customers'
import {
  createBulkInsertOrDoNothingFunction,
  createCursorPaginatedSelectFunction,
  createDerivePricingModelId,
  createDerivePricingModelIds,
  createInsertFunction,
  createPaginatedSelectFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  createUpsertFunction,
  type ORMMethodCreatorConfig,
  whereClauseFromObject,
} from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'
import { PaymentStatus } from '@/types'
import { invoices } from '../schema/invoices'
import {
  organizations,
  organizationsSelectSchema,
} from '../schema/organizations'
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
  tableName: 'customers',
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

/**
 * Derives pricingModelId from a customer.
 * Used for payment methods.
 */
export const derivePricingModelIdFromCustomer =
  createDerivePricingModelId(
    customersTable,
    config,
    selectCustomerById
  )

/**
 * Batch fetch pricingModelIds for multiple customers.
 * More efficient than calling derivePricingModelIdFromCustomer individually.
 * Used by bulk insert operations in payment methods.
 */
export const pricingModelIdsForCustomers =
  createDerivePricingModelIds(customersTable, config)

export const insertCustomer = createInsertFunction(
  customersTable,
  config
)

export const updateCustomer = createUpdateFunction(
  customersTable,
  config
)

export const selectCustomerByExternalIdAndOrganizationId = async (
  params: { externalId: string; organizationId: string },
  transaction: DbTransaction
) => {
  const result = await transaction
    .select()
    .from(customersTable)
    .where(
      and(
        eq(customersTable.externalId, params.externalId),
        eq(customersTable.organizationId, params.organizationId)
      )
    )
    .limit(1)
  const [row] = result
  return row ? customersSelectSchema.parse(row) : null
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
    // FIXME: else / if for customers with purchases that have ended
    // FIXME: else / if for customers with unpaid invoices
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
  const totalSpendAndCustomerId = await transaction
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
  >(totalSpendAndCustomerId.map((cps) => [`${cps.customerId}`, cps]))

  return customerAndCustomer.map((row) => {
    const data = dataByCustomerId.get(`${row.customer.id}`)
    let status: InferredCustomerStatus = InferredCustomerStatus.Active
    if (row.customer.archived) {
      status = InferredCustomerStatus.Archived
    } else if (!data?.earliestPurchase) {
      status = InferredCustomerStatus.Pending
    }
    // FIXME: else / if for customers with purchases that have ended
    // FIXME: else / if for customers with unpaid invoices
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

export const assignStackAuthHostedBillingUserIdToCustomersWithMatchingEmailButNoStackAuthHostedBillingUserId =
  async (
    params: {
      email: string
      stackAuthHostedBillingUserId: string
    },
    transaction: DbTransaction
  ) => {
    const customers = await transaction
      .select()
      .from(customersTable)
      .where(
        and(
          isNull(customersTable.stackAuthHostedBillingUserId),
          eq(customersTable.email, params.email)
        )
      )
    await transaction
      .update(customersTable)
      .set({
        stackAuthHostedBillingUserId:
          params.stackAuthHostedBillingUserId,
      })
      .where(
        inArray(
          customersTable.id,
          customers.map((c) => c.id)
        )
      )
  }

export const mapCustomerEmailToStackAuthHostedBillingUserId = async (
  email: string,
  transaction: DbTransaction
): Promise<string | null | undefined> => {
  const customersWithMatchingEmail = await transaction
    .select()
    .from(customersTable)
    .where(eq(customersTable.email, email))
  return customersWithMatchingEmail.find(
    (c) => c.stackAuthHostedBillingUserId
  )?.stackAuthHostedBillingUserId
}

export const selectCustomersCursorPaginatedWithTableRowData =
  createCursorPaginatedSelectFunction(
    customersTable,
    config,
    customersPaginatedTableRowDataSchema,
    async (customersResult, transaction) => {
      const totalSpendAndCustomerId = await transaction
        .select({
          customerId: customersTable.id,
          totalSpend: sql<number>`SUM(${payments.amount})`,
          totalInvoices: sql<number>`COUNT(${invoices.id})`,
          earliestPurchase: sql<Date>`MIN(${purchases.purchaseDate})`,
        })
        .from(customersTable)
        .leftJoin(
          invoices,
          eq(customersTable.id, invoices.customerId)
        )
        .leftJoin(payments, eq(invoices.id, payments.invoiceId))
        .leftJoin(
          purchases,
          eq(customersTable.id, purchases.customerId)
        )
        .where(
          and(
            inArray(
              customersTable.id,
              customersResult.map((c) => c.id)
            ),
            inArray(payments.status, [
              PaymentStatus.Succeeded,
              PaymentStatus.Processing,
            ])
          )
        )
        .groupBy(customersTable.id)

      const dataByCustomerId = new Map<
        string,
        {
          totalSpend: number
          totalInvoices: number
          earliestPurchase?: Date
        }
      >(
        totalSpendAndCustomerId.map((cps) => [
          `${cps.customerId}`,
          cps,
        ])
      )

      const customersWithTableRowData = customersResult.map((row) => {
        const data = dataByCustomerId.get(`${row.id}`)
        let status: InferredCustomerStatus =
          InferredCustomerStatus.Active
        if (row.archived) {
          status = InferredCustomerStatus.Archived
        } else if (!data?.earliestPurchase) {
          status = InferredCustomerStatus.Pending
        }
        // FIXME: else / if for customers with purchases that have ended
        // FIXME: else / if for customers with unpaid invoices
        return {
          customer: customersSelectSchema.parse(row),
          totalSpend: Number(
            dataByCustomerId.get(`${row.id}`)?.totalSpend ?? 0
          ),
          payments: Number(
            dataByCustomerId.get(`${row.id}`)?.totalInvoices ?? 0
          ),
          status,
        }
      })
      return customersWithTableRowData
    },
    // searchableColumns: email and name for partial ILIKE matches
    [customersTable.email, customersTable.name],
    /**
     * Additional search clause handler for customers table.
     * Enables searching customers by exact customer ID in addition to
     * the base email/name partial matches from searchableColumns.
     *
     * @param searchQuery - The search query string from the user
     * @returns SQL condition for OR-ing with base search, or undefined if query is empty
     */
    ({ searchQuery }) => {
      const trimmedQuery =
        typeof searchQuery === 'string'
          ? searchQuery.trim()
          : searchQuery

      if (!trimmedQuery) return undefined

      // Match customers by exact ID (combined with base email/name via OR)
      return eq(customersTable.id, trimmedQuery)
    }
  )

export const selectCustomerAndOrganizationByCustomerWhere = async (
  whereConditions: Partial<Customer.Record>,
  transaction: DbTransaction
) => {
  const result = await transaction
    .select({
      customer: customers,
      organization: organizations,
    })
    .from(customers)
    .innerJoin(
      organizations,
      eq(customers.organizationId, organizations.id)
    )
    .where(whereClauseFromObject(customers, whereConditions))
  return z
    .object({
      customer: customersSelectSchema,
      organization: organizationsSelectSchema,
    })
    .array()
    .parse(result)
}

export const setUserIdForCustomerRecords = async (
  {
    customerEmail,
    userId,
  }: { customerEmail: string; userId: string },
  transaction: DbTransaction
) => {
  await transaction
    .update(customersTable)
    .set({ userId })
    .where(
      and(
        eq(customersTable.email, customerEmail),
        /*
         * For now, only support setting user id for livemode customers,
         * so we can avoid unintentionally setting user id for test mode customers
         * for the merchant.
         *
         * FIXME: support setting user id for test mode customers specifically.
         * This will require more sophisticated auth business logic.
         */
        eq(customersTable.livemode, true)
      )
    )
}
