import { PaymentStatus } from '@db-core/enums'
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
} from '@db-core/schema/customers'
import { invoices } from '@db-core/schema/invoices'
import {
  organizations,
  organizationsSelectSchema,
} from '@db-core/schema/organizations'
import { payments } from '@db-core/schema/payments'
import { purchases } from '@db-core/schema/purchases'
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
} from '@db-core/tableUtils'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { DbTransaction } from '@/db/types'
import { ArchivedCustomerError } from '@/errors'

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

/**
 * Selects customers matching the given conditions.
 *
 * @warning This function returns ALL customers including archived ones.
 * For public API endpoints, use `selectCustomerByExternalIdAndOrganizationId()`
 * which filters out archived customers by default.
 */
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
    async (id, transaction) => {
      const result = await selectCustomerById(id, transaction)
      return result.unwrap()
    }
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
  params: {
    externalId: string
    organizationId: string
    /**
     * When false (default), only returns non-archived customers.
     * When true, returns customers regardless of archived status.
     * Use includeArchived=true when you need to handle idempotency
     * (e.g., archiving an already-archived customer).
     */
    includeArchived?: boolean
  },
  transaction: DbTransaction
) => {
  const {
    externalId,
    organizationId,
    includeArchived = false,
  } = params
  const result = await transaction
    .select()
    .from(customersTable)
    .where(
      and(
        eq(customersTable.externalId, externalId),
        eq(customersTable.organizationId, organizationId),
        includeArchived
          ? undefined
          : eq(customersTable.archived, false)
      )
    )
    .limit(1)
  const [row] = result
  return row ? customersSelectSchema.parse(row) : null
}

/**
 * Selects customers with table row data, scoped to a specific organization.
 *
 * @param whereConditions - Filter conditions (must NOT include organizationId - use the parameter)
 * @param organizationId - Required organization ID for security scoping
 * @param transaction - Database transaction
 */
export const selectCustomerAndCustomerTableRows = async (
  whereConditions: Omit<Partial<Customer.Record>, 'organizationId'>,
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
    .where(
      and(
        eq(customersTable.organizationId, organizationId),
        whereClauseFromObject(customersTable, whereConditions)
      )
    )
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

/**
 * Minimal customer data needed for pricing model resolution in bulk operations.
 * Only fetches the fields required to determine which pricing model applies to each customer.
 *
 * Note: pricingModelId is NOT NULL in the database schema, so it will always be a string.
 */
export type CustomerPricingInfo = {
  id: string
  pricingModelId: string
  organizationId: string
  livemode: boolean
  /**
   * Included for early validation in bulk operations to prevent
   * processing events for archived customers before expensive lookups.
   */
  archived: boolean
}

/**
 * Performance-optimized batch fetch of customer pricing info.
 * Only selects the minimal fields needed for pricing model resolution.
 * replacing N individual selectCustomerById calls with a single query.
 *
 * @param customerIds - Array of customer IDs to fetch
 * @param transaction - Database transaction
 * @returns Map of customerId to CustomerPricingInfo
 */
export const selectCustomerPricingInfoBatch = async (
  customerIds: string[],
  transaction: DbTransaction
): Promise<Map<string, CustomerPricingInfo>> => {
  if (customerIds.length === 0) {
    return new Map()
  }

  const results = await transaction
    .select({
      id: customers.id,
      pricingModelId: customers.pricingModelId,
      organizationId: customers.organizationId,
      livemode: customers.livemode,
      archived: customers.archived,
    })
    .from(customers)
    .where(inArray(customers.id, customerIds))

  return new Map(results.map((c) => [c.id, c]))
}

/**
 * Guard function that throws if the customer is archived.
 * Use this to block operations on archived customers such as
 * creating payment methods or usage events.
 *
 * @param customer - The customer to check
 * @param operation - Description of the operation being attempted (for error message)
 * @throws ArchivedCustomerError if customer is archived
 */
export const assertCustomerNotArchived = (
  customer: Customer.Record,
  operation: string
): void => {
  if (customer.archived) {
    throw new ArchivedCustomerError(operation)
  }
}
