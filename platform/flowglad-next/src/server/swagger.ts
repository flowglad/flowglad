import { generateOpenApiDocument } from 'trpc-swagger'
import { appRouter } from './index'
import { FlowgladEventType } from '@/types'
import { eventPayloadSchema } from '@/db/schema/events'
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

export type OpenAPIV3Document = ReturnType<
  typeof generateOpenApiDocument
>

export const createFlowgladOpenApiDocument = () =>
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
