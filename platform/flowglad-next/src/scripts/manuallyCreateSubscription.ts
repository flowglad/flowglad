/* 
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/manuallyCreateSubscription.ts
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { createSubscriptionWorkflow } from '@/subscriptions/createSubscription'
import { adminTransaction } from '@/db/adminTransaction'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectProductById } from '@/db/tableMethods/productMethods'
import {
  selectPriceById,
  selectPriceProductAndOrganizationByPriceWhere,
} from '@/db/tableMethods/priceMethods'
import { IntervalUnit } from '@/types'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'

async function manuallyCreateSubscription(db: PostgresJsDatabase) {
  // eslint-disable-next-line no-console
  await db.transaction(async (transaction) => {
    const [{ price, product, organization }] =
      await selectPriceProductAndOrganizationByPriceWhere(
        {
          id: '',
        },
        transaction
      )
    const customer = await selectCustomerById('', transaction)
    const defaultPaymentMethod = await selectPaymentMethodById(
      'pm_123',
      transaction
    )
    throw new Error('test===')
    return createSubscriptionWorkflow(
      {
        organization,
        customer,
        product,
        price,
        quantity: 1,
        livemode: true,
        startDate: new Date(),
        interval: IntervalUnit.Month,
        intervalCount: 1,
        autoStart: false,
        defaultPaymentMethod,
      },
      transaction
    )
  })
}

runScript(manuallyCreateSubscription)
