/* 
run the following in the terminal
NODE_ENV=production bunx tsx src/scripts/openApiDoc.ts
*/

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import yaml from 'json-to-pretty-yaml'
import { createFlowgladOpenApiDocument } from '@/server/swagger'
import runScript from './scriptRunner'

async function openApiDoc(db: PostgresJsDatabase) {
  // eslint-disable-next-line no-console
  console.log(yaml.stringify(createFlowgladOpenApiDocument()))
}

runScript(openApiDoc)
