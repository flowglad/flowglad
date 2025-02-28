/* Example script with targeted environment
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/open.ts
*/

import { createFlowgladOpenApiDocument } from '@/server/swagger'
import yaml from 'json-to-pretty-yaml'
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'

async function openApiDoc(db: PostgresJsDatabase) {
  console.log(yaml.stringify(createFlowgladOpenApiDocument()))
}

runScript(openApiDoc)
