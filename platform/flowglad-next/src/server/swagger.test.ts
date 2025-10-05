import { expect, describe, it } from 'vitest'
import { createFlowgladOpenApiDocument } from './swagger'
import type { OpenAPIV3Document } from './swagger'

describe('Swagger Configuration', () => {
  const openApiDoc: OpenAPIV3Document =
    createFlowgladOpenApiDocument()
  const paths = openApiDoc.paths

  describe('Input Schema Validation', () => {
    const forbiddenFields = [
      'createdAt',
      'updatedAt',
      'createdByCommit',
      'updatedByCommit',
      'position',
      'securitySalt',
    ]

    const checkSchemaForForbiddenFields = (
      schema: any,
      path: string
    ) => {
      if (!schema || typeof schema !== 'object') return

      // Check if any of the forbidden fields are in required array
      if (Array.isArray(schema.required)) {
        const hasForbiddenFields = schema.required.some(
          (field: string) => forbiddenFields.includes(field)
        )
        if (hasForbiddenFields) {
          throw new Error(
            `Schema contains forbidden required fields: ${JSON.stringify(schema.required)} at path: ${path}`
          )
        }
      }

      // Recursively check nested schemas
      Object.entries(schema).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          checkSchemaForForbiddenFields(value, `${path}.${key}`)
        }
      })
    }

    it('should not have forbidden fields in any input schemas', () => {
      // TODO: stronger types
      Object.values(paths || {}).forEach((path: any) => {
        Object.values(path).forEach((method: any) => {
          if (
            (method.operationId as string).endsWith('-create') &&
            method.requestBody?.content?.['application/json']?.schema
          ) {
            checkSchemaForForbiddenFields(
              method.requestBody.content['application/json'].schema,
              path
            )
          }
        })
      })
    })
  })

  describe('Output Schema Validation', () => {
    const checkSchemaForForbiddenOutputFields = (
      schema: any,
      path: string
    ) => {
      if (!schema || typeof schema !== 'object') return
      const forbiddenOutputColumns = ['position', 'securitySalt']
      // Check for properties starting with "stripe*" and "position"
      if (schema.properties) {
        Object.keys(schema.properties).forEach((key) => {
          if (
            key.startsWith('stripe') ||
            forbiddenOutputColumns.includes(key)
          ) {
            throw new Error(
              `Schema contains forbidden output field "${key}" at path: ${path}`
            )
          }
          if (
            key.startsWith('createdAtCommit') ||
            key.startsWith('updatedAtCommit')
          ) {
            throw new Error(
              `Schema contains forbidden output field "${key}" at path: ${path}`
            )
          }
        })
      }

      // Recursively check nested schemas
      Object.entries(schema).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          checkSchemaForForbiddenOutputFields(value, `${path}.${key}`)
        }
      })
    }

    it('should not have "stripe*" or "position" or "createdAtCommit" or "updatedAtCommit" fields in any output schemas', () => {
      Object.values(paths || {}).forEach((path: any) => {
        Object.values(path).forEach((method: any) => {
          if (method.responses) {
            Object.values(method.responses).forEach(
              (response: any) => {
                if (response.content?.['application/json']?.schema) {
                  checkSchemaForForbiddenOutputFields(
                    response.content['application/json'].schema,
                    path
                  )
                }
              }
            )
          }
        })
      })
    })
  })

  describe('OrganizationId in Request Body Validation', () => {
    const checkSchemaForOrganizationId = (
      schema: any,
      path: string,
      httpMethod: string // Renamed from methodKey for clarity, and used in error message
    ) => {
      if (!schema || typeof schema !== 'object') return

      if (schema.properties && schema.properties.organizationId) {
        throw new Error(
          `Schema for ${httpMethod.toUpperCase()} at path ${path} contains forbidden field "organizationId" in properties`
        )
      }

      if (
        Array.isArray(schema.required) &&
        schema.required.includes('organizationId')
      ) {
        throw new Error(
          `Schema for ${httpMethod.toUpperCase()} at path ${path} contains forbidden field "organizationId" in required array`
        )
      }

      // Recursively check nested schemas
      Object.entries(schema).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          checkSchemaForOrganizationId(
            value,
            `${path}.${key}`,
            httpMethod
          )
        }
      })
    }

    it('should not have "organizationId" in any POST request body schemas', () => {
      Object.entries(paths || {}).forEach(
        ([pathKey, pathValue]: [string, any]) => {
          Object.entries(pathValue).forEach(
            ([methodKey, methodValue]: [string, any]) => {
              if (
                methodKey.toLowerCase() === 'post' &&
                methodValue.requestBody?.content?.['application/json']
                  ?.schema
              ) {
                checkSchemaForOrganizationId(
                  methodValue.requestBody.content['application/json']
                    .schema,
                  pathKey,
                  methodKey // Pass the actual method key (e.g., 'post')
                )
              }
            }
          )
        }
      )
    })

    it('should not have "organizationId" in any PUT request body schemas', () => {
      Object.entries(paths || {}).forEach(
        ([pathKey, pathValue]: [string, any]) => {
          Object.entries(pathValue).forEach(
            ([methodKey, methodValue]: [string, any]) => {
              if (
                methodKey.toLowerCase() === 'put' &&
                methodValue.requestBody?.content?.['application/json']
                  ?.schema
              ) {
                checkSchemaForOrganizationId(
                  methodValue.requestBody.content['application/json']
                    .schema,
                  pathKey,
                  methodKey // Pass the actual method key (e.g., 'put')
                )
              }
            }
          )
        }
      )
    })
  })

  describe('Customer Route Parameters', () => {
    it('should have {externalId} as the parameter for customer routes', () => {
      const customerPaths = Object.entries(paths || {}).filter(
        ([path]) => path.includes('/customer/')
      )

      customerPaths.forEach(([path, pathObj]: [string, any]) => {
        Object.values(pathObj).forEach((method: any) => {
          const parameters = method.parameters || []
          const pathParams = parameters.filter(
            (param: any) => param.in === 'path'
          )

          if (pathParams.length > 0) {
            expect(pathParams[0].name).toBe('externalId')
            expect(pathParams[0].schema.type).toBe('string')
          }
        })
      })
    })
  })

  describe('OpenAPI Document Structure', () => {
    it('should have the correct base configuration', () => {
      expect(openApiDoc.openapi).toBeDefined()
      expect(openApiDoc.info.title).toBe('Flowglad API')
      expect(openApiDoc.info.version).toBe('0.0.1')
      //   expect(openApiDoc.servers?.[0]?.url).toBe(
      //     'https://app.flowglad.com'
      //   )
      //   expect(openApiDoc.security).toBeDefined()
      //   expect(openApiDoc.security?.[0].ApiKeyAuth).toBeDefined()
    })

    // it('should have valid security scheme configuration', () => {
    //   const securityScheme =
    //     openApiDoc.components?.securitySchemes?.ApiKeyAuth
    //   expect(securityScheme?.type).toBe('apiKey')
    //   expect(securityScheme?.in).toBe('header')
    //   expect(securityScheme?.name).toBe('Authorization')
    // })
  })

  describe('Route Structure Validation', () => {
    const expectedBaseRoutes = [
      '/api/v1/pricing-models',
      '/api/v1/pricing-models/default',
      '/api/v1/pricing-models/setup',
      '/api/v1/checkout-sessions',
      '/api/v1/customers',
      '/api/v1/discounts',
      '/api/v1/features',
      '/api/v1/invoice-line-items',
      '/api/v1/invoices',
      '/api/v1/payments',
      '/api/v1/products',
      '/api/v1/prices',
      '/api/v1/product-features',
      '/api/v1/subscriptions',
      '/api/v1/subscription-item-features',
      '/api/v1/payment-methods',
      '/api/v1/usage-meters',
      '/api/v1/usage-events',
      '/api/v1/webhooks',
    ]

    it('should only have the expected base routes', () => {
      const actualBaseRoutes = Object.keys(paths || {})
        .filter(
          (path) =>
            !path.includes('/{') && path.startsWith('/api/v1/')
        )
        .sort()
      expect(actualBaseRoutes).toEqual(expectedBaseRoutes.sort())
    })

    describe('Payments Routes', () => {
      const basePath = '/api/v1/payments'

      it('should have correct base route methods', () => {
        const route = paths?.[basePath]
        expect(route).toBeDefined()
        // payments only supports GET for now
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get'].sort()
        )
      })

      it('should have correct {id} route methods', () => {
        const route = paths?.[`${basePath}/{id}`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get'].sort()
        )
      })

      it('should have correct refund route methods', () => {
        const route = paths?.[`${basePath}/{id}/refund`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['post'].sort()
        )
      })
    })

    describe('Checkout Sessions Routes', () => {
      const basePath = '/api/v1/checkout-sessions'

      it('should have correct base route methods', () => {
        const route = paths?.[basePath]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get', 'post'].sort()
        )
      })

      it('should have correct {id} route methods', () => {
        const route = paths?.[`${basePath}/{id}`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get'].sort()
        )
      })
    })

    describe('Products Routes', () => {
      const basePath = '/api/v1/products'

      it('should have correct base route methods', () => {
        const route = paths?.[basePath]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get', 'post'].sort()
        )
      })

      it('should have correct {id} route methods', () => {
        const route = paths?.[`${basePath}/{id}`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get', 'put'].sort()
        )
      })
    })

    describe('Prices Routes', () => {
      const basePath = '/api/v1/prices'

      it('should have correct base route methods', () => {
        const route = paths?.[basePath]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get', 'post'].sort()
        )
      })

      it('should have correct {id} route methods', () => {
        const route = paths?.[`${basePath}/{id}`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['put'].sort()
        )
      })
    })

    describe('Discounts Routes', () => {
      const basePath = '/api/v1/discounts'

      it('should have correct base route methods', () => {
        const route = paths?.[basePath]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get', 'post'].sort()
        )
      })

      it('should have correct {id} route methods', () => {
        const route = paths?.[`${basePath}/{id}`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get', 'put'].sort()
        )
      })
    })

    describe('Invoice Line Items Routes', () => {
      const basePath = '/api/v1/invoice-line-items'

      it('should have correct base route methods', () => {
        const route = paths?.[basePath]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get'].sort()
        )
      })

      it('should have correct {id} route methods', () => {
        const route = paths?.[`${basePath}/{id}`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get'].sort()
        )
      })
    })

    describe('Invoices Routes', () => {
      const basePath = '/api/v1/invoices'

      it('should have correct base route methods', () => {
        const route = paths?.[basePath]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get', 'post'].sort()
        )
      })

      it('should have correct {id} route methods', () => {
        const route = paths?.[`${basePath}/{id}`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get', 'put'].sort()
        )
      })

      it('should have correct send-reminder route methods', () => {
        const route = paths?.[`${basePath}/{id}/send-reminder`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['post'].sort()
        )
      })
    })

    describe('Pricing Models Routes', () => {
      const basePath = '/api/v1/pricing-models'

      it('should have correct base route methods', () => {
        const route = paths?.[basePath]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get', 'post'].sort()
        )
      })

      it('should have correct {id} route methods', () => {
        const route = paths?.[`${basePath}/{id}`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get', 'put'].sort()
        )
      })

      it('should have correct default route methods', () => {
        const route = paths?.[`${basePath}/default`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get'].sort()
        )
      })

      it('should have correct clone route methods', () => {
        const route = paths?.[`${basePath}/{id}/clone`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['post'].sort()
        )
      })
    })

    describe('API Keys Routes', () => {
      const basePath = '/api/v1/api-keys'

      it('should have correct {id} route methods', () => {
        const route = paths?.[`${basePath}/{id}`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get'].sort()
        )
      })
    })

    describe('Subscriptions Routes', () => {
      const basePath = '/api/v1/subscriptions'

      it('should have correct base route methods', () => {
        const route = paths?.[basePath]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get', 'post'].sort()
        )
      })

      it('should have correct {id} route methods', () => {
        const route = paths?.[`${basePath}/{id}`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get'].sort()
        )
      })

      it('should have correct adjust route methods', () => {
        const route = paths?.[`${basePath}/{id}/adjust`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['post'].sort()
        )
      })

      it('should have correct cancel route methods', () => {
        const route = paths?.[`${basePath}/{id}/cancel`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['post'].sort()
        )
      })
    })

    describe('Payment Methods Routes', () => {
      const basePath = '/api/v1/payment-methods'

      it('should have correct base route methods', () => {
        const route = paths?.[basePath]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get'].sort()
        )
      })

      it('should have correct {id} route methods', () => {
        const route = paths?.[`${basePath}/{id}`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get'].sort()
        )
      })
    })

    describe('Usage Meters Routes', () => {
      const basePath = '/api/v1/usage-meters'

      it('should have correct base route methods', () => {
        const route = paths?.[basePath]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get', 'post'].sort()
        )
      })

      it('should have correct {id} route methods', () => {
        const route = paths?.[`${basePath}/{id}`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get', 'put'].sort()
        )
      })
    })

    describe('Usage Events Routes', () => {
      const basePath = '/api/v1/usage-events'

      it('should have correct base route methods', () => {
        const route = paths?.[basePath]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get', 'post'].sort()
        )
      })

      it('should have correct {id} route methods', () => {
        const route = paths?.[`${basePath}/{id}`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get'].sort()
        )
      })
    })

    describe('Features Routes', () => {
      const basePath = '/api/v1/features'

      it('should have correct base route methods', () => {
        const route = paths?.[basePath]
        expect(route).toBeDefined()
        // Assuming GET (list) and POST (create)
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get', 'post'].sort()
        )
      })

      it('should have correct {id} route methods', () => {
        const route = paths?.[`${basePath}/{id}`]
        expect(route).toBeDefined()
        // Assuming GET (by id) and PUT (update)
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get', 'put'].sort()
        )
      })
    })

    describe('Product Features Routes', () => {
      const basePath = '/api/v1/product-features'

      it('should have correct base route methods', () => {
        const route = paths?.[basePath]
        expect(route).toBeDefined()
        // GET (list), POST (create)
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get', 'post'].sort()
        )
      })

      it('should have correct {id} route methods', () => {
        const route = paths?.[`${basePath}/{id}`]
        expect(route).toBeDefined()
        // GET (by id),  No PUT or DELETE for product-features as per our router
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get'].sort()
        )
      })
    })

    describe('Subscription Item Features Routes', () => {
      const basePath = '/api/v1/subscription-item-features'

      it('should have correct base route methods', () => {
        const route = paths?.[basePath]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          /**
           * No list method for this resource
           */
          ['post'].sort()
        )
      })

      it('should have correct {id} route methods', () => {
        const route = paths?.[`${basePath}/{id}`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get', 'put'].sort()
        )
      })

      it('should have correct {id}/expire route methods', () => {
        const routes = Object.keys(paths || {}).filter((key) =>
          key.startsWith(basePath)
        )
        const route = paths?.[`${basePath}/{id}/expire`]
        expect(route).toBeDefined()
        expect(Object.keys(route || {}).sort()).toEqual(
          ['post'].sort()
        )
      })
    })

    describe('Webhooks Routes', () => {
      const basePath = '/api/v1/webhooks'

      it('should have correct base route methods', () => {
        const route = paths?.[basePath]
        expect(route).toBeDefined()
        // Assuming GET (list) and POST (create)
        expect(Object.keys(route || {}).sort()).toEqual(
          // TODO: standardize list methods / procedures
          ['post'].sort()
        )
      })

      it('should have correct {id} route methods', () => {
        const route = paths?.[`${basePath}/{id}`]
        expect(route).toBeDefined()
        // Assuming GET (by id), PUT (update), and DELETE (by id)
        expect(Object.keys(route || {}).sort()).toEqual(
          ['get', 'put'].sort()
        )
      })
    })
  })

  describe('Timestamp Fields Shape', () => {
    const TIMESTAMP_MIN = -9007199254740991
    const TIMESTAMP_MAX = 9007199254740991

    const checkTimestampFields = (schema: any, path: string) => {
      if (!schema || typeof schema !== 'object') return

      if (
        schema.properties &&
        typeof schema.properties === 'object'
      ) {
        ;['createdAt', 'updatedAt'].forEach((key) => {
          const prop = schema.properties[key]
          if (prop && typeof prop === 'object') {
            if (prop.type !== 'integer') {
              console.log('====prop', prop)
              throw new Error(
                `Schema contains forbidden field "${key}" at path: ${path}`
              )
            }
            expect(prop.type).toBe('integer')
            expect(prop.minimum).toBe(TIMESTAMP_MIN)
            expect(prop.maximum).toBe(TIMESTAMP_MAX)
          }
        })
      }

      // Recursively check nested schemas (objects, arrays via items, etc.)
      Object.entries(schema).forEach(([k, v]) => {
        if (typeof v === 'object' && v !== null) {
          checkTimestampFields(v, `${path}.${k}`)
        }
      })
    }

    it('should enforce bounds for createdAt/updatedAt in all request body schemas', () => {
      Object.entries(paths || {}).forEach(
        ([pathKey, pathValue]: [string, any]) => {
          Object.entries(pathValue).forEach(
            ([methodKey, methodValue]: [string, any]) => {
              const requestSchema =
                methodValue.requestBody?.content?.['application/json']
                  ?.schema
              if (requestSchema) {
                checkTimestampFields(
                  requestSchema,
                  `${pathKey}.${methodKey}.request`
                )
              }
            }
          )
        }
      )
    })

    it('should enforce bounds for createdAt/updatedAt in all response schemas', () => {
      Object.entries(paths || {}).forEach(
        ([pathKey, pathValue]: [string, any]) => {
          Object.entries(pathValue).forEach(
            ([methodKey, methodValue]: [string, any]) => {
              if (methodValue.responses) {
                Object.values(methodValue.responses).forEach(
                  (response: any) => {
                    const responseSchema =
                      response.content?.['application/json']?.schema
                    if (responseSchema) {
                      checkTimestampFields(
                        responseSchema,
                        `${pathKey}.${methodKey}.response`
                      )
                    }
                  }
                )
              }
            }
          )
        }
      )
    })

    it('should enforce bounds for createdAt/updatedAt in components.schemas', () => {
      const schemas = openApiDoc.components?.schemas || {}
      Object.entries(schemas).forEach(
        ([name, schema]: [string, any]) => {
          checkTimestampFields(schema, `components.schemas.${name}`)
        }
      )
    })
  })

  describe('Epoch milliseconds description enforcement', () => {
    const TIMESTAMP_MIN = -9007199254740991
    const TIMESTAMP_MAX = 9007199254740991

    const checkEpochDescriptionSchemas = (
      schema: any,
      path: string
    ) => {
      if (!schema || typeof schema !== 'object') return

      const desc = String(schema.description || '')
      if (desc.includes('Epoch milliseconds')) {
        if (Array.isArray(schema.anyOf)) {
          const anyOf = schema.anyOf as any[]
          const stringEntries = anyOf.filter(
            (s) => s && typeof s === 'object' && s.type === 'string'
          )
          expect(stringEntries.length).toBe(0)

          const integerEntries = anyOf.filter(
            (s) => s && typeof s === 'object' && s.type === 'integer'
          )
          expect(integerEntries.length).toBeGreaterThan(0)
          integerEntries.forEach((intSchema) => {
            expect(intSchema.minimum).toBe(TIMESTAMP_MIN)
            expect(intSchema.maximum).toBe(TIMESTAMP_MAX)
            // Keep original description on the integer entry
            expect(String(intSchema.description || '')).toContain(
              'Epoch milliseconds'
            )
          })

          const nullEntries = anyOf.filter(
            (s) => s && typeof s === 'object' && s.type === 'null'
          )
          // Nullable is allowed; if present, must be exactly type null
          expect(nullEntries.length).toBeGreaterThanOrEqual(0)
        } else {
          // Non-nullable: must be a bounded integer
          expect(schema.type).toBe('integer')
          expect(schema.minimum).toBe(TIMESTAMP_MIN)
          expect(schema.maximum).toBe(TIMESTAMP_MAX)
        }
      }

      // Recurse into nested structures
      if (
        schema.properties &&
        typeof schema.properties === 'object'
      ) {
        Object.entries(schema.properties).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null) {
            checkEpochDescriptionSchemas(
              value,
              `${path}.properties.${key}`
            )
          }
        })
      }

      if (schema.items && typeof schema.items === 'object') {
        checkEpochDescriptionSchemas(schema.items, `${path}.items`)
      }

      ;['allOf', 'oneOf', 'anyOf'].forEach((key) => {
        const arr = (schema as any)[key]
        if (Array.isArray(arr)) {
          arr.forEach((sub, idx) => {
            if (sub && typeof sub === 'object') {
              checkEpochDescriptionSchemas(
                sub,
                `${path}.${key}[${idx}]`
              )
            }
          })
        }
      })

      if (
        schema.additionalProperties &&
        typeof schema.additionalProperties === 'object'
      ) {
        checkEpochDescriptionSchemas(
          schema.additionalProperties,
          `${path}.additionalProperties`
        )
      }

      if (schema.not && typeof schema.not === 'object') {
        checkEpochDescriptionSchemas(schema.not, `${path}.not`)
      }
    }

    it('enforces correct shape for all request schemas with Epoch milliseconds description', () => {
      Object.entries(paths || {}).forEach(
        ([pathKey, pathValue]: [string, any]) => {
          Object.entries(pathValue).forEach(
            ([methodKey, methodValue]: [string, any]) => {
              const requestSchema =
                methodValue.requestBody?.content?.['application/json']
                  ?.schema
              if (requestSchema) {
                checkEpochDescriptionSchemas(
                  requestSchema,
                  `${pathKey}.${methodKey}.request`
                )
              }
            }
          )
        }
      )
    })

    it('enforces correct shape for all response schemas with Epoch milliseconds description', () => {
      Object.entries(paths || {}).forEach(
        ([pathKey, pathValue]: [string, any]) => {
          Object.entries(pathValue).forEach(
            ([methodKey, methodValue]: [string, any]) => {
              if (methodValue.responses) {
                Object.values(methodValue.responses).forEach(
                  (response: any) => {
                    const responseSchema =
                      response.content?.['application/json']?.schema
                    if (responseSchema) {
                      checkEpochDescriptionSchemas(
                        responseSchema,
                        `${pathKey}.${methodKey}.response`
                      )
                    }
                  }
                )
              }
            }
          )
        }
      )
    })

    it('enforces correct shape in components.schemas for Epoch milliseconds description', () => {
      const schemas = openApiDoc.components?.schemas || {}
      Object.entries(schemas).forEach(
        ([name, schema]: [string, any]) => {
          checkEpochDescriptionSchemas(
            schema,
            `components.schemas.${name}`
          )
        }
      )
    })
  })
})
