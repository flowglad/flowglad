import { camelCase, kebabCase } from 'change-case'
import type { OpenApiMeta, OpenApiMethod } from 'trpc-to-openapi'
import { titleCase } from './core'

export type CreateOpenApiMetaParams = {
  /***
   * Used to override the default id param for the resource.
   * so, e.g. idParamOverride: 'externalId' =>
   *  customer/:id -> customer/:externalId
   */
  idParamOverride?: string
  routeSuffix?: string
  resource: string
  summary: string
  tags: string[]
  description?: string
}

const constructIdParam = (params: CreateOpenApiMetaParams) => {
  return `${kebabCase(params.resource)}/{${
    params.idParamOverride ?? 'id'
  }}`
}

export const createGetOpenApiMeta = (
  params: CreateOpenApiMetaParams
): OpenApiMeta => {
  const { summary, tags } = params
  return {
    openapi: {
      method: 'GET',
      path: `/api/v1/${constructIdParam(params)}${
        params.routeSuffix ? `/${params.routeSuffix}` : ''
      }`,
      summary,
      tags,
      protect: true,
    },
  }
}

export const createPostOpenApiMetaWithIdParam = (
  params: CreateOpenApiMetaParams
): OpenApiMeta => {
  const { summary, tags } = params
  return createPostOpenApiMeta({
    ...params,
    requireIdParam: true,
  })
}

export const createPostOpenApiMeta = ({
  resource,
  summary,
  tags,
  routeSuffix,
  requireIdParam = false,
  idParamOverride,
  description,
}: CreateOpenApiMetaParams & {
  requireIdParam?: boolean
  idParamOverride?: string
}): OpenApiMeta => {
  return {
    openapi: {
      method: 'POST',
      path: `/api/v1/${kebabCase(resource)}${
        requireIdParam ? `/{${idParamOverride ?? 'id'}}` : ''
      }${routeSuffix ? `/${routeSuffix}` : ''}`,
      summary,
      ...(description ? { description } : {}),
      tags,
      protect: true,
    },
  }
}

const createPutOpenApiMeta = (
  params: CreateOpenApiMetaParams
): OpenApiMeta => {
  const { summary, tags } = params
  return {
    openapi: {
      method: 'PUT',
      path: `/api/v1/${constructIdParam(params)}${
        params.routeSuffix ? `/${params.routeSuffix}` : ''
      }`,
      summary,
      tags,
      protect: true,
    },
  }
}

const createListOpenApiMeta = (
  params: CreateOpenApiMetaParams
): OpenApiMeta => {
  const { summary, tags, resource } = params
  return {
    openapi: {
      method: 'GET',
      path: `/api/v1/${kebabCase(resource)}`,
      summary,
      tags,
      protect: true,
    },
  }
}

const createDeleteOpenApiMeta = (
  params: CreateOpenApiMetaParams
): OpenApiMeta => {
  const { summary, tags } = params
  return {
    openapi: {
      method: 'DELETE',
      path: `/api/v1/${constructIdParam(params)}`,
      summary,
      tags,
      protect: true,
    },
  }
}

export interface OpenApiMetaOutput {
  GET: OpenApiMeta
  POST: OpenApiMeta
  PUT: OpenApiMeta
  DELETE: OpenApiMeta
  LIST: OpenApiMeta
}

const openApiMetaOutputKeyToProcedureVerb = (
  key: keyof OpenApiMetaOutput
) => {
  switch (key) {
    case 'GET':
      return 'get'
    case 'POST':
      return 'create'
    case 'PUT':
      return 'update'
    case 'DELETE':
      return 'delete'
    case 'LIST':
      return 'list'
  }
}

export const generateOpenApiMetas = (params: {
  resource: string
  pluralResource?: string
  idParamOverride?: string
  tags: string[]
  /**
   * unused
   */
  specialRoutes?: {
    name: string
    path: string
    method: OpenApiMethod
    summary: string
  }[]
}): {
  openApiMetas: OpenApiMetaOutput
  routeConfigs: Record<string, RouteConfig>[]
} => {
  const pluralResource = camelCase(
    params.pluralResource ?? `${params.resource}s`
  )
  const titleCaseResource = titleCase(params.resource)
  const openApiMetas: OpenApiMetaOutput = {
    GET: createGetOpenApiMeta({
      resource: pluralResource,
      summary: `Get ${titleCaseResource}`,
      tags: params.tags,
      idParamOverride: params.idParamOverride,
    }),
    POST: createPostOpenApiMeta({
      resource: pluralResource,
      summary: `Create ${titleCaseResource}`,
      tags: params.tags,
    }),
    PUT: createPutOpenApiMeta({
      resource: pluralResource,
      summary: `Update ${titleCaseResource}`,
      tags: params.tags,
      idParamOverride: params.idParamOverride,
    }),
    DELETE: createDeleteOpenApiMeta({
      resource: pluralResource,
      summary: `Delete ${titleCaseResource}`,
      tags: params.tags,
      idParamOverride: params.idParamOverride,
    }),
    LIST: createListOpenApiMeta({
      resource: pluralResource,
      summary: `List ${titleCase(pluralResource)}`,
      tags: params.tags,
      idParamOverride: params.idParamOverride,
    }),
  } as const
  return {
    openApiMetas,
    routeConfigs: Object.keys(openApiMetas).map((key) => {
      return trpcToRest(
        `${pluralResource}.${openApiMetaOutputKeyToProcedureVerb(
          key as keyof OpenApiMetaOutput
        )}`,
        {
          routeParams: params.idParamOverride
            ? [params.idParamOverride]
            : undefined,
        }
      )
    }),
  }
}

// Define route patterns with parameter mapping
export type RouteConfig = {
  procedure: string
  pattern: RegExp
  // Function to extract params from URL and build tRPC input
  mapParams: (matches: string[], body?: any) => any
}

export const trpcToRest = (
  procedureName: string,
  params?: {
    routeParams?: string[]
  }
): Record<string, RouteConfig> => {
  // Split procedure name into entity and action
  const [rawEntity, action] = procedureName.split('.')
  const entity = kebabCase(rawEntity)
  if (!entity || !action) {
    throw new Error(
      `Invalid procedure name: ${procedureName}. Expected format: entity.action`
    )
  }
  // Special cases for utility endpoints
  if (entity === 'utils') {
    return {
      [`GET /${entity}/${action}`]: {
        procedure: procedureName,
        pattern: new RegExp(`^${entity}/${action}$`),
        mapParams: () => undefined,
      },
    }
  }
  // Handle common CRUD operations
  switch (action) {
    case 'list':
      return {
        [`GET /${entity}`]: {
          procedure: procedureName,
          pattern: new RegExp(`^${entity}$`),
          mapParams: () => undefined,
        },
      }

    case 'create':
      return {
        [`POST /${entity}`]: {
          procedure: procedureName,
          pattern: new RegExp(`^${entity}$`),
          mapParams: (_, body) => body,
        },
      }

    case 'update': {
      const updateIdKey = params?.routeParams?.[0] ?? 'id'
      return {
        [`PUT /${entity}/:${updateIdKey}`]: {
          procedure: procedureName,
          pattern: new RegExp(`^${entity}/([^\\/]+)$`),
          mapParams: (matches, body) => ({
            ...body,
            [updateIdKey]: matches[0],
          }),
        },
      }
    }
    case 'edit': {
      const editIdKey = params?.routeParams?.[0] ?? 'id'
      return {
        [`PUT /${entity}/:${editIdKey}`]: {
          procedure: procedureName,
          pattern: new RegExp(`^${entity}/([^\\/]+)$`),
          mapParams: (matches, body) => ({
            ...body,
            [editIdKey]: matches[0],
          }),
        },
      }
    }

    case 'delete': {
      const deleteIdKey = params?.routeParams?.[0] ?? 'id'
      return {
        [`DELETE /${entity}/:${deleteIdKey}`]: {
          procedure: procedureName,
          pattern: new RegExp(`^${entity}/([^\\/]+)$`),
          mapParams: (matches) => ({
            [deleteIdKey]: matches[0],
          }),
        },
      }
    }

    case 'get': {
      const getIdKey = params?.routeParams?.[0] ?? 'id'
      return {
        [`GET /${entity}/:${getIdKey}`]: {
          procedure: procedureName,
          pattern: new RegExp(`^${entity}/([^\\/]+)$`),
          mapParams: (matches) => ({
            [getIdKey]: matches[0],
          }),
        },
      }
    }

    // Handle special cases for nested resources or custom actions
    default:
      // Check if it's a nested resource getter (like getRevenue)
      if (action.startsWith('get')) {
        const resource = action.slice(3).toLowerCase()
        // Use camelCase for the entity ID key (e.g., resourceClaimsId not resource-claimsId)
        const entityIdKey = `${camelCase(entity)}Id`
        return {
          [`GET /${entity}/:id/${resource}`]: {
            procedure: procedureName,
            pattern: new RegExp(`^${entity}/([^\\/]+)/${resource}$`),
            mapParams: (matches) => ({
              [entityIdKey]: matches[1],
            }),
          },
        }
      }

      // For other custom actions, create a POST endpoint
      return {
        [`POST /${entity}/:id/${action}`]: {
          procedure: procedureName,
          pattern: new RegExp(`^${entity}/([^\\/]+)/${action}$`),
          mapParams: (matches, body) => ({
            ...body,
            id: matches[0],
          }),
        },
      }
  }
}
