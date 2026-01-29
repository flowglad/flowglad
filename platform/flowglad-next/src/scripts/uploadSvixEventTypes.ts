/* eslint-disable no-console */
/* 
run the following in the terminal
NODE_ENV=production bunx tsx src/scripts/uploadSvixEventTypes.ts svix_secret_key=...
*/

import { FlowgladEventType } from '@db-core/enums'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { Svix } from 'svix'
import runScript from './scriptRunner'

const uploadSvixEventTypes = async (db: PostgresJsDatabase) => {
  const args = process.argv.slice(2)
  const svixSecretKeyArg = args.find((arg) =>
    arg.startsWith('svix_secret_key=')
  )

  if (!svixSecretKeyArg) {
    console.error('Error: svix_secret_key argument is required')
    console.error(
      'Usage: NODE_ENV=production bunx tsx src/scripts/uploadSvixEventTypes.ts svix_secret_key=...'
    )
    process.exit(1)
  }

  const svixSecretKey = svixSecretKeyArg.split('=')[1]
  const svix = new Svix(svixSecretKey)
  for await (const eventType of Object.values(FlowgladEventType)) {
    const eventTypeOut = await svix.eventType.create({
      name: eventType,
      description: eventType,
    })
    console.log(eventTypeOut)
  }
}

runScript(uploadSvixEventTypes)
