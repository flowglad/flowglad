/*
run the following in the terminal
NODE_ENV=production bunx tsx src/scripts/openApiDoc.ts [destination-path]
*/

import { promises as fs } from 'fs'
import { createFlowgladOpenApiDocument } from '@/server/swagger'

/**
 * Generates the OpenAPI document and writes it to the specified path or ./openapi.json by default.
 * @param destPath - The optional destination file path for the OpenAPI document.
 */
async function openApiDoc(destPath?: string): Promise<void> {
  const outputPath = destPath || './openapi.json'
  const openApiDoc = createFlowgladOpenApiDocument()
  const jsonString = JSON.stringify(openApiDoc, null, 2)
  await fs.writeFile(outputPath, jsonString, 'utf8')
  // eslint-disable-next-line no-console
  console.log(`OpenAPI document written to ${outputPath}`)
}

if (require.main === module) {
  const destPath = process.argv[2]
  openApiDoc(destPath).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Error generating OpenAPI document:', err)
    process.exit(1)
  })
}
