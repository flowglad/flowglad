import {
  CustomerProfile,
  customerProfiles as customerProfilesTable,
  customerProfilesInsertSchema,
  customerProfilesSelectSchema,
  customerProfilesUpdateSchema,
  InferredCustomerProfileStatus,
  type CustomerTableRowData,
} from '@/db/schema/customerProfiles'
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
import { customers, customersSelectSchema } from '../schema/customers'
import { PaymentStatus } from '@/types'
import { DbTransaction } from '@/db/types'
import { invoices } from '../schema/invoices'
import { payments } from '../schema/payments'
import { purchases } from '../schema/purchases'

const config: ORMMethodCreatorConfig<
  typeof customerProfilesTable,
  typeof customerProfilesSelectSchema,
  typeof customerProfilesInsertSchema,
  typeof customerProfilesUpdateSchema
> = {
  selectSchema: customerProfilesSelectSchema,
  insertSchema: customerProfilesInsertSchema,
  updateSchema: customerProfilesUpdateSchema,
}

export const selectCustomerProfileById = createSelectById(
  customerProfilesTable,
  config
)

export const upsertCustomerProfileByCustomerIdAndOrganizationId =
  createUpsertFunction(
    customerProfilesTable,
    [
      customerProfilesTable.CustomerId,
      customerProfilesTable.organizationId,
    ],
    config
  )

export const upsertCustomerProfileByOrganizationIdAndInvoiceNumberBase =
  createUpsertFunction(
    customerProfilesTable,
    [
      customerProfilesTable.organizationId,
      customerProfilesTable.invoiceNumberBase,
    ],
    config
  )

export const selectCustomerProfiles = createSelectFunction(
  customerProfilesTable,
  config
)

export const insertCustomerProfile = createInsertFunction(
  customerProfilesTable,
  config
)

export const updateCustomerProfile = createUpdateFunction(
  customerProfilesTable,
  config
)

export const selectCustomerProfileAndCustomerFromCustomerProfileWhere =
  async (
    whereConditions: Partial<CustomerProfile.Record>,
    transaction: DbTransaction
  ) => {
    const result = await transaction
      .select({
        customerProfile: customerProfilesTable,
        customer: customers,
      })
      .from(customerProfilesTable)
      .innerJoin(
        customers,
        eq(customerProfilesTable.CustomerId, customers.id)
      )
      .where(
        whereClauseFromObject(customerProfilesTable, whereConditions)
      )
    return result.map((row) => ({
      customerProfile: customerProfilesSelectSchema.parse(
        row.customerProfile
      ),
      customer: customersSelectSchema.parse(row.customer),
    }))
  }

export const selectCustomerProfileAndCustomerTableRows = async (
  whereConditions: Partial<CustomerProfile.Record>,
  transaction: DbTransaction
): Promise<CustomerTableRowData[]> => {
  /**
   * These will be used to derive the status
   */
  const totalSpendAndCustomerProfileId = await transaction
    .select({
      CustomerProfileId: customerProfilesTable.id,
      totalSpend: sql<number>`SUM(${payments.amount})`,
      totalInvoices: sql<number>`COUNT(${invoices.id})`,
      earliestPurchase: sql<Date>`MIN(${purchases.purchaseDate})`,
    })
    .from(customerProfilesTable)
    .innerJoin(
      customers,
      eq(customerProfilesTable.CustomerId, customers.id)
    )
    .leftJoin(
      invoices,
      eq(customerProfilesTable.id, invoices.CustomerProfileId)
    )
    .leftJoin(payments, eq(invoices.id, payments.InvoiceId))
    .leftJoin(
      purchases,
      eq(customerProfilesTable.id, purchases.CustomerProfileId)
    )
    .where(
      and(
        whereClauseFromObject(customerProfilesTable, whereConditions),
        inArray(payments.status, [
          PaymentStatus.Succeeded,
          PaymentStatus.Processing,
        ])
      )
    )
    .groupBy(customerProfilesTable.id)

  const customerAndCustomerProfile = await transaction
    .select({
      customerProfile: customerProfilesTable,
      customer: customers,
    })
    .from(customerProfilesTable)
    .innerJoin(
      customers,
      eq(customerProfilesTable.CustomerId, customers.id)
    )
    .where(
      whereClauseFromObject(customerProfilesTable, whereConditions)
    )
    .orderBy(desc(customerProfilesTable.createdAt))

  const dataByCustomerProfileId = new Map<
    string,
    {
      totalSpend: number
      totalInvoices: number
      earliestPurchase?: Date
    }
  >(
    totalSpendAndCustomerProfileId.map((cps) => [
      `${cps.CustomerProfileId}`,
      cps,
    ])
  )

  return customerAndCustomerProfile.map((row) => {
    const data = dataByCustomerProfileId.get(
      `${row.customerProfile.id}`
    )
    let status: InferredCustomerProfileStatus =
      InferredCustomerProfileStatus.Active
    if (row.customerProfile.archived) {
      status = InferredCustomerProfileStatus.Archived
    } else if (!data?.earliestPurchase) {
      status = InferredCustomerProfileStatus.Pending
    }
    // TODO: else / if for customers with purchases that have ended
    // TODO: else / if for customers with unpaid invoices
    return {
      customerProfile: customerProfilesSelectSchema.parse(
        row.customerProfile
      ),
      customer: customersSelectSchema.parse(row.customer),
      totalSpend: dataByCustomerProfileId.get(
        `${row.customerProfile.id}`
      )?.totalSpend,
      payments: dataByCustomerProfileId.get(
        `${row.customerProfile.id}`
      )?.totalInvoices,
      status,
    }
  })
}

const bulkInsertCustomerProfilesOrDoNothing =
  createBulkInsertOrDoNothingFunction(customerProfilesTable, config)

export const bulkInsertOrDoNothinCustomerProfilesByCustomerIdAndOrganizationId =
  (
    customerProfiles: CustomerProfile.Insert[],
    transaction: DbTransaction
  ) => {
    return bulkInsertCustomerProfilesOrDoNothing(
      customerProfiles,
      [
        customerProfilesTable.CustomerId,
        customerProfilesTable.organizationId,
      ],
      transaction
    )
  }

export const selectCustomerProfilesByOrganizationIdAndEmails = async (
  organizationId: string,
  emails: string[],
  transaction: DbTransaction
) => {
  const result = await transaction
    .select()
    .from(customerProfilesTable)
    .where(
      and(
        eq(customerProfilesTable.organizationId, organizationId),
        inArray(customerProfilesTable.email, emails)
      )
    )
  return result.map((row) => customerProfilesSelectSchema.parse(row))
}

export const selectCustomerProfilesPaginated =
  createPaginatedSelectFunction(customerProfilesTable, config)
