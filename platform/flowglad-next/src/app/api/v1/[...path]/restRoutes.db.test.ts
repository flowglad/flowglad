import { describe, expect, it } from 'bun:test'
import { createFlowgladOpenApiDocument } from '@/server/swagger'
import { routes } from './restRoutes'

describe('REST route configs ↔ OpenAPI document unity', () => {
  const isRecord = (
    value: unknown
  ): value is Record<string, unknown> => {
    return (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    )
  }

  const normalizeRestPath = (path: string) => {
    const prefixed = path.startsWith('/api/v1/')
      ? path
      : `/api/v1${path.startsWith('/') ? '' : '/'}${path}`
    return prefixed.replace(/:([^/]+)/g, '{$1}')
  }

  const buildRestRouteKeys = () => {
    return new Set(
      Object.keys(routes).map((routeKey) => {
        const [method, path] = routeKey.split(' ')
        if (!method || !path) {
          throw new Error(
            `Invalid REST route key: ${routeKey}. Expected format: "METHOD /path"`
          )
        }
        return `${method.toUpperCase()} ${normalizeRestPath(path)}`
      })
    )
  }

  const buildOpenApiRouteKeys = () => {
    const document = createFlowgladOpenApiDocument()
    const openApiPaths = document.paths
    if (!isRecord(openApiPaths)) {
      return new Set<string>()
    }

    const allowedMethods = new Set(['get', 'post', 'put', 'delete'])
    const routeKeys = new Set<string>()

    Object.entries(openApiPaths).forEach(([path, pathItem]) => {
      if (!path.startsWith('/api/v1/')) return
      if (!isRecord(pathItem)) return

      Object.entries(pathItem).forEach(([method, operation]) => {
        if (!allowedMethods.has(method.toLowerCase())) return
        if (!operation) return
        routeKeys.add(`${method.toUpperCase()} ${path}`)
      })
    })

    return routeKeys
  }

  it('should have exact method+path parity between consolidated REST routes and OpenAPI paths', () => {
    const restRouteKeys = buildRestRouteKeys()
    const openApiRouteKeys = buildOpenApiRouteKeys()

    const missingInRest = Array.from(openApiRouteKeys).filter(
      (key) => !restRouteKeys.has(key)
    )

    // We allow REST routes to include internal / undocumented endpoints.
    // The invariant we care about is: every OpenAPI path+method must exist in the consolidated REST routes.
    if (missingInRest.length > 0) {
      throw new Error(
        [
          'OpenAPI/REST route mismatch.',
          '',
          'Missing in REST (present in OpenAPI document):',
          ...missingInRest.sort().map((k) => `- ${k}`),
        ].join('\n')
      )
    }

    expect(missingInRest).toEqual([])
  })
})
