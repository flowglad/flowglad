/* Example script with targeted environment
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/importLemonSqueezySubscribersToCustomerProfiles.ts
*/

import fs from 'fs/promises'
import path from 'path'
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { CustomerProfile } from '@/db/schema/customerProfiles'
import { customersInsertSchema } from '@/db/schema/customers'
import { bulkIdempotentInsertCustomersByEmail } from '@/db/tableMethods/customerMethods'
import { bulkInsertOrDoNothinCustomerProfilesBycustomerIdAndorganizationId } from '@/db/tableMethods/customerProfileMethods'
import { customerAndCustomerProfileInsertsFromCSV } from '@/utils/purchaseHelpers'
import core from '@/utils/core'

const ORGANIZATION_ID = ''

async function csvToJson(db: PostgresJsDatabase) {
  try {
    // Read the CSV file
    const csvPath = path.join(
      process.cwd(),
      'src',
      'scripts',
      'data',
      'input.csv'
    )
    const csvContent = await fs.readFile(csvPath, 'utf-8')

    const { customerInserts, customerProfileInserts } =
      await customerAndCustomerProfileInsertsFromCSV(
        csvContent,
        ORGANIZATION_ID,
        true
      )

    const customerUpserts = customerInserts.map((row) => {
      const customerUpsert = customersInsertSchema.safeParse({
        email: row.email,
        name: row.name ?? '',
      })
      if (!customerUpsert.success) {
        console.error(
          'Invalid customer data:',
          customerUpsert.error,
          'For row:',
          row
        )
        throw new Error('Invalid customer data')
      }
      return customerUpsert.data
    })

    await db.transaction(async (transaction) => {
      const customers = await bulkIdempotentInsertCustomersByEmail(
        customerUpserts,
        transaction
      )
      const customersMap = new Map(
        customers.map((customer) => [customer.email, customer])
      )
      const customerProfileUpserts = customerProfileInserts.map(
        (row) => {
          const customer = customersMap.get(row.email!)
          if (!customer) {
            throw new Error(
              `Customer not found for email: ${row.email}`
            )
          }
          const customerProfile: CustomerProfile.Insert = {
            email: row.email,
            name: row.name,
            customerId: customer.id,
            organizationId: ORGANIZATION_ID,
            externalId: core.nanoid(),
            livemode: true,
          }
          return customerProfile
        }
      )
      const result =
        await bulkInsertOrDoNothinCustomerProfilesBycustomerIdAndorganizationId(
          customerProfileUpserts,
          transaction
        )
      return result
    })
  } catch (error) {
    console.error('Error processing CSV:', error)
    throw error
  }
}

runScript(csvToJson)
