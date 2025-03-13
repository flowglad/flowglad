import { protectedProcedure } from '@/server/trpc'
import { z } from 'zod'
import {
  adminTransaction,
  authenticatedTransaction,
} from '@/db/databaseMethods'
import {
  Customer,
  customersInsertSchema,
} from '@/db/schema/customers'
import { bulkIdempotentInsertCustomersByEmail } from '@/db/tableMethods/customerMethods'
import { bulkInsertOrDoNothinCustomerProfilesBycustomerIdAndorganizationId } from '@/db/tableMethods/customerProfileMethods'
import {
  bulkImportCustomerProfilesInputSchema,
  CustomerProfile,
} from '@/db/schema/customerProfiles'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import {
  customerAndCustomerProfileInsertsFromBulkImport,
  customerAndCustomerProfileInsertsFromCSV,
} from '@/utils/purchaseHelpers'
import core from '@/utils/core'

export const bulkImportCustomerProfiles = protectedProcedure
  .input(bulkImportCustomerProfilesInputSchema)
  .mutation(async ({ input, ctx }) => {
    const organization = await authenticatedTransaction(
      async ({ transaction, userId }) => {
        const [{ organization }] =
          await selectMembershipAndOrganizations(
            {
              UserId: userId,
              focused: true,
            },
            transaction
          )
        return organization
      }
    )
    const { customerUpserts, incompleteCustomerProfileUpserts } =
      await customerAndCustomerProfileInsertsFromBulkImport(
        input,
        organization.id,
        ctx.livemode
      )
    const customers = await adminTransaction(
      async ({ transaction }) => {
        return bulkIdempotentInsertCustomersByEmail(
          customerUpserts,
          transaction
        )
      }
    )

    const result = await authenticatedTransaction(
      async ({ transaction, userId, livemode }) => {
        const customersMap = new Map(
          customers.map((customer) => [customer.email, customer])
        )

        const [{ organization }] =
          await selectMembershipAndOrganizations(
            {
              UserId: userId,
              focused: true,
            },
            transaction
          )
        const customerProfileUpserts =
          incompleteCustomerProfileUpserts.map((row) => {
            const customer = customersMap.get(row.email)

            if (!customer) {
              throw new Error(
                `Customer not found for email: ${row.email}`
              )
            }

            const customerProfile: CustomerProfile.Insert = {
              email: row.email,
              name: row.name,
              customerId: customer.id,
              organizationId: organization.id,
              externalId: core.nanoid(),
              livemode,
            }
            return customerProfile
          })

        return await bulkInsertOrDoNothinCustomerProfilesBycustomerIdAndorganizationId(
          customerProfileUpserts,
          transaction
        )
      }
    )

    return {
      data: result,
    }
  })
