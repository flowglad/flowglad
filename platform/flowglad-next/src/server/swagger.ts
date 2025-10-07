import { generateOpenApiDocument } from 'trpc-to-openapi'
import { appRouter } from '@/server'

export type OpenAPIV3Document = ReturnType<
  typeof generateOpenApiDocument
>

export const createFlowgladOpenApiDocument = () => {
  const rawDocument = generateOpenApiDocument(appRouter, {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'Authorization',
      },
    },
    title: 'Flowglad API',
    version: '0.0.1', // consider making this pull version from package.json
    baseUrl: 'https://app.flowglad.com',
    docsUrl: 'https://docs.flowglad.com',
  })

  const TIMESTAMP_MIN = -9007199254740991
  const TIMESTAMP_MAX = 9007199254740991

  const isObject = (value: unknown): value is Record<string, any> => {
    return (
      !!value && typeof value === 'object' && !Array.isArray(value)
    )
  }

  const ensureIntegerEpochSchema = (description?: string) => ({
    description: description ?? 'Epoch milliseconds.',
    type: 'integer',
    minimum: TIMESTAMP_MIN,
    maximum: TIMESTAMP_MAX,
  })

  const transformEpochSchemaInPlace = (schema: any): void => {
    if (!isObject(schema)) return

    if (
      (schema.description as string)?.endsWith('Epoch milliseconds.')
    ) {
      if (Array.isArray(schema.anyOf)) {
        const allowsNull = schema.anyOf.some(
          (candidate: any) =>
            isObject(candidate) && candidate.type === 'null'
        )

        const integerSchema = ensureIntegerEpochSchema(
          schema.description
        )

        // Replace anyOf with the required integer schema and optional null
        schema.anyOf = allowsNull
          ? [integerSchema, { type: 'null' }]
          : [integerSchema]

        // Remove conflicting top-level type if present
        if (schema.type) delete schema.type
        if ('minimum' in schema) delete schema.minimum
        if ('maximum' in schema) delete schema.maximum
      } else if (schema.type === 'string') {
        // Replace string with bounded integer
        schema.type = 'integer'
        delete schema.format
        schema.minimum = TIMESTAMP_MIN
        schema.maximum = TIMESTAMP_MAX
      }
    }

    // Recurse into nested schemas
    if (schema.properties && isObject(schema.properties)) {
      Object.values(schema.properties).forEach((prop: any) =>
        transformEpochSchemaInPlace(prop)
      )
    }

    if (schema.items) {
      transformEpochSchemaInPlace(schema.items)
    }

    ;['allOf', 'oneOf', 'anyOf'].forEach((key) => {
      if (Array.isArray(schema[key as keyof typeof schema])) {
        ;(schema[key as keyof typeof schema] as any[]).forEach(
          (sub) => transformEpochSchemaInPlace(sub)
        )
      }
    })

    if (
      schema.additionalProperties &&
      isObject(schema.additionalProperties)
    ) {
      transformEpochSchemaInPlace(schema.additionalProperties)
    }

    if (schema.not && isObject(schema.not)) {
      transformEpochSchemaInPlace(schema.not)
    }
  }

  // Traverse request/response schemas under paths
  if (rawDocument.paths && isObject(rawDocument.paths)) {
    Object.values(rawDocument.paths).forEach((pathItem: any) => {
      if (!isObject(pathItem)) return
      Object.values(pathItem).forEach((operation: any) => {
        if (!isObject(operation)) return

        const requestSchema =
          operation.requestBody?.content?.['application/json']?.schema
        if (requestSchema) transformEpochSchemaInPlace(requestSchema)

        if (operation.responses && isObject(operation.responses)) {
          Object.values(operation.responses).forEach(
            (response: any) => {
              const responseSchema =
                response?.content?.['application/json']?.schema
              if (responseSchema)
                transformEpochSchemaInPlace(responseSchema)
            }
          )
        }
      })
    })
  }

  // Traverse component schemas as well
  if (
    rawDocument.components?.schemas &&
    isObject(rawDocument.components.schemas)
  ) {
    Object.values(rawDocument.components.schemas).forEach(
      (schema: any) => transformEpochSchemaInPlace(schema)
    )
  }

  return rawDocument
}
