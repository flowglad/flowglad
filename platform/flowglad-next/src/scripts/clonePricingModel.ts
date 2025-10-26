/* eslint-disable no-console */
/* 
Run the following in the terminal
NODE_ENV=production bunx tsx src/scripts/clonePricingModel.ts pricing_model_id=pm_... [destination_env=livemode|testmode]
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { selectPricingModelById } from '@/db/tableMethods/pricingModelMethods'
import { clonePricingModelTransaction } from '@/utils/pricingModel'
import { DestinationEnvironment } from '@/types'

const clonePricingModel = async (db: PostgresJsDatabase) => {
  // Parse CLI arguments
  const args = process.argv.slice(2)
  const pricingModelIdArg = args.find((arg) =>
    arg.startsWith('pricing_model_id=')
  )
  const destinationEnvArg = args.find((arg) =>
    arg.startsWith('destination_env=')
  )

  if (!pricingModelIdArg) {
    console.error('Error: pricing_model_id argument is required')
    console.error(
      'Usage: NODE_ENV=production bunx tsx src/scripts/clonePricingModel.ts pricing_model_id=pm_... [destination_env=livemode|testmode]'
    )
    process.exit(1)
  }

  const pricingModelId = pricingModelIdArg.split('=')[1]
  if (!pricingModelId) {
    throw new Error(
      'Please provide a pricing model ID as a command line argument'
    )
  }

  let destinationEnvironment: DestinationEnvironment | undefined
  if (destinationEnvArg) {
    const envValue = destinationEnvArg.split('=')[1]?.toLowerCase()
    if (envValue === 'livemode') {
      destinationEnvironment = DestinationEnvironment.Livemode
    } else if (envValue === 'testmode') {
      destinationEnvironment = DestinationEnvironment.Testmode
    } else {
      throw new Error(
        'destination_env must be one of: livemode, testmode'
      )
    }
  }

  await db.transaction(async (transaction) => {
    const sourcePricingModel = await selectPricingModelById(
      pricingModelId,
      transaction
    )

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const clonedName = `${sourcePricingModel.name} (Clone ${timestamp})`

    const cloned = await clonePricingModelTransaction(
      {
        id: sourcePricingModel.id,
        name: clonedName,
        destinationEnvironment,
      },
      transaction
    )

    console.log(
      `Cloned pricing model created: id=${cloned.id}, name="${cloned.name}", livemode=${cloned.livemode}`
    )
  })
}

runScript(clonePricingModel)
