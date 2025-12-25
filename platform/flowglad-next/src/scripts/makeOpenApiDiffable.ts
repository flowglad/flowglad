/*
Script to transform OpenAPI files to be compatible with oasdiff.
Converts exclusiveMinimum from OpenAPI 3.1 format (number) to OpenAPI 3.0 format (boolean).

Usage:
bunx tsx src/scripts/makeOpenApiDiffable.ts <source-path> [destination-path]

If destination-path is not provided, defaults to "<source-filename>__diffable.json"
*/

import { promises as fs } from 'fs'
import path from 'path'

const isObject = (value: unknown): value is Record<string, any> => {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Converts exclusiveMinimum from OpenAPI 3.1 format (number) to OpenAPI 3.0 format (boolean).
 * When exclusiveMinimum is a number, sets minimum to that value and exclusiveMinimum to true.
 */
const transformExclusiveMinimumInPlace = (schema: any): void => {
  if (!isObject(schema)) return

  // Convert exclusiveMinimum from number to boolean format (for oasdiff compatibility)
  if (
    typeof schema.exclusiveMinimum === 'number' &&
    !('minimum' in schema)
  ) {
    schema.minimum = schema.exclusiveMinimum
    schema.exclusiveMinimum = true
  }

  // Recurse into nested schemas
  if (schema.properties && isObject(schema.properties)) {
    Object.values(schema.properties).forEach((prop: any) =>
      transformExclusiveMinimumInPlace(prop)
    )
  }

  if (schema.items) {
    transformExclusiveMinimumInPlace(schema.items)
  }

  ;['allOf', 'oneOf', 'anyOf'].forEach((key) => {
    if (Array.isArray(schema[key as keyof typeof schema])) {
      ;(schema[key as keyof typeof schema] as any[]).forEach((sub) =>
        transformExclusiveMinimumInPlace(sub)
      )
    }
  })

  if (
    schema.additionalProperties &&
    isObject(schema.additionalProperties)
  ) {
    transformExclusiveMinimumInPlace(schema.additionalProperties)
  }

  if (schema.not && isObject(schema.not)) {
    transformExclusiveMinimumInPlace(schema.not)
  }
}

async function makeOpenApiDiffable(
  sourcePath: string,
  destPath?: string
): Promise<void> {
  const fileContent = await fs.readFile(sourcePath, 'utf8')
  const openApiDoc = JSON.parse(fileContent)

  // Traverse request/response schemas under paths
  if (openApiDoc.paths && isObject(openApiDoc.paths)) {
    Object.values(openApiDoc.paths).forEach((pathItem: any) => {
      if (!isObject(pathItem)) return
      Object.values(pathItem).forEach((operation: any) => {
        if (!isObject(operation)) return

        const requestSchema =
          operation.requestBody?.content?.['application/json']?.schema
        if (requestSchema) {
          transformExclusiveMinimumInPlace(requestSchema)
        }

        if (operation.responses && isObject(operation.responses)) {
          Object.values(operation.responses).forEach(
            (response: any) => {
              const responseSchema =
                response?.content?.['application/json']?.schema
              if (responseSchema) {
                transformExclusiveMinimumInPlace(responseSchema)
              }
            }
          )
        }
      })
    })
  }

  // Traverse component schemas as well
  if (
    openApiDoc.components?.schemas &&
    isObject(openApiDoc.components.schemas)
  ) {
    Object.values(openApiDoc.components.schemas).forEach(
      (schema: any) => {
        transformExclusiveMinimumInPlace(schema)
      }
    )
  }

  const outputPath =
    destPath ||
    path.join(
      path.dirname(sourcePath),
      `${path.basename(sourcePath, path.extname(sourcePath))}__diffable.json`
    )

  const jsonString = JSON.stringify(openApiDoc, null, 2)
  await fs.writeFile(outputPath, jsonString, 'utf8')
  // eslint-disable-next-line no-console
  console.log(`Created diffable OpenAPI file: ${outputPath}`)
}

if (require.main === module) {
  const sourcePath = process.argv[2]
  const destPath = process.argv[3]

  if (!sourcePath) {
    // eslint-disable-next-line no-console
    console.error(
      'Usage: bunx tsx src/scripts/makeOpenApiDiffable.ts <source-path> [destination-path]'
    )
    process.exit(1)
  }

  makeOpenApiDiffable(sourcePath, destPath).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Error making OpenAPI diffable:', err)
    process.exit(1)
  })
}
