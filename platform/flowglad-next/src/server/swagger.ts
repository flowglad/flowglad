import { generateOpenApiDocument } from 'trpc-swagger'
import { appRouter } from './index'
import { FlowgladEventType } from '@/types'
import { eventPayloadSchema } from '@/db/schema/events'
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

export type OpenAPIV3Document = ReturnType<
  typeof generateOpenApiDocument
>

export const createFlowgladOpenApiDocument = () =>
  enhanceWithWebhooks(
    generateOpenApiDocument(appRouter, {
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
  )

export function enhanceWithWebhooks(
  doc: OpenAPIV3Document
): OpenAPIV3Document {
  const registry = new OpenAPIRegistry()

  // Register the event payload schema
  registry.register('EventPayload', eventPayloadSchema)

  // Register each webhook event type
  Object.values(FlowgladEventType).forEach((eventType) => {
    registry.registerWebhook({
      method: 'post',
      path: `/webhooks/${eventType}`,
      summary: `Webhook for ${eventType}`,
      description: `This webhook is triggered when a ${eventType} event occurs`,
      request: {
        body: {
          content: {
            'application/json': {
              schema: eventPayloadSchema,
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Webhook processed successfully',
        },
      },
    })
  })

  // Merge the webhook definitions into the existing document
  return {
    ...doc,
    paths: {
      ...doc.paths,
      ...registry.definitions.reduce(
        (acc, def) => {
          if ('path' in def) {
            acc[def.path as string] = {
              ...acc[def.path as string],
              [def.method]: def,
            }
          }
          return acc
        },
        {} as Record<string, any>
      ),
    },
  }
}
