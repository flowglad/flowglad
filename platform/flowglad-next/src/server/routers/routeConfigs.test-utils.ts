import { expect } from 'vitest'
import type { RouteConfig } from '@/utils/openapi'

/**
 * Helper function to find a route config in an array of route config objects
 * Used for routers that export an array structure from generateOpenApiMetas
 */
export function findRouteConfigInArray(
  routeConfigs: Array<Record<string, RouteConfig>>,
  routeKey: string
): RouteConfig | undefined {
  for (const routeConfigObj of routeConfigs) {
    if (routeConfigObj[routeKey]) {
      return routeConfigObj[routeKey]
    }
  }
  return undefined
}

/**
 * Helper function to get all route keys from an array of route config objects
 * Used for routers that export an array structure from generateOpenApiMetas
 */
export function getAllRouteKeysFromArray(
  routeConfigs: Array<Record<string, RouteConfig>>
): string[] {
  const keys: string[] = []
  for (const routeConfigObj of routeConfigs) {
    keys.push(...Object.keys(routeConfigObj))
  }
  return keys
}

/**
 * Helper function to find a route config in a flattened object structure
 * Used for routers that flatten array configs into an object with numeric keys
 * (e.g., subscriptionItemFeaturesRouter)
 */
export function findRouteConfigInFlattenedObject(
  routeConfigs: Record<string, any>,
  routeKey: string
): RouteConfig | undefined {
  // Check direct properties first (for custom routes)
  if (routeConfigs[routeKey] && routeConfigs[routeKey].procedure) {
    return routeConfigs[routeKey]
  }

  // Check numeric properties which contain the base route configs
  for (const key in routeConfigs) {
    const value = routeConfigs[key]
    if (
      typeof value === 'object' &&
      value !== null &&
      !value.procedure
    ) {
      // This is a nested object containing route configs
      if (value[routeKey]) {
        return value[routeKey]
      }
    }
  }
  return undefined
}

/**
 * Helper function to get all route keys from a flattened object structure
 * Used for routers that flatten array configs into an object with numeric keys
 */
export function getAllRouteKeysFromFlattenedObject(
  routeConfigs: Record<string, any>
): string[] {
  const keys: string[] = []

  for (const key in routeConfigs) {
    const value = routeConfigs[key]

    if (typeof value === 'object' && value !== null) {
      if (value.procedure) {
        // This is a direct route config
        keys.push(key)
      } else {
        // This is a nested object containing route configs
        keys.push(...Object.keys(value))
      }
    }
  }

  return keys
}

/**
 * Helper function to find a route config in a plain object structure
 * Used for routers that export a simple object mapping
 */
export function findRouteConfigInObject(
  routeConfigs: Record<string, RouteConfig>,
  routeKey: string
): RouteConfig {
  const routeConfig = routeConfigs[routeKey]
  if (!routeConfig) {
    throw new Error(`Route config not found for key: ${routeKey}`)
  }
  return routeConfig
}

/**
 * Helper function to get all route keys from a plain object structure
 */
export function getAllRouteKeysFromObject(
  routeConfigs: Record<string, RouteConfig>
): string[] {
  return Object.keys(routeConfigs)
}

/**
 * Test helper to validate a route config structure
 * Checks that all required properties exist and are of the correct type
 */
export function validateRouteConfigStructure(
  config: RouteConfig,
  procedurePrefix: string
): void {
  expect(config).toHaveProperty('procedure')
  expect(config).toHaveProperty('pattern')
  expect(config).toHaveProperty('mapParams')

  // Procedure should be a valid TRPC procedure path
  expect(config.procedure).toMatch(
    new RegExp(`^${procedurePrefix}\\.\\w+$`)
  )

  // Pattern should be a RegExp
  expect(config.pattern).toBeInstanceOf(RegExp)

  // mapParams should be a function
  expect(typeof config.mapParams).toBe('function')
}

/**
 * Test helper to validate standard CRUD route mappings
 */
export function validateStandardCrudMappings(
  findRouteConfig: (key: string) => RouteConfig | undefined,
  resourcePath: string,
  procedurePrefix: string,
  idParam: string = 'id'
): void {
  const expectedMappings = {
    [`POST /${resourcePath}`]: `${procedurePrefix}.create`,
    [`PUT /${resourcePath}/:${idParam}`]: `${procedurePrefix}.update`,
    [`GET /${resourcePath}/:${idParam}`]: `${procedurePrefix}.get`,
    [`GET /${resourcePath}`]: `${procedurePrefix}.list`,
    [`DELETE /${resourcePath}/:${idParam}`]: `${procedurePrefix}.delete`,
  }

  Object.entries(expectedMappings).forEach(
    ([routeKey, expectedProcedure]) => {
      const config = findRouteConfig(routeKey)
      expect(config!.procedure).toBe(expectedProcedure)
    }
  )
}

/**
 * Test helper for validating pattern matching
 */
export function testPatternMatching(
  pattern: RegExp,
  shouldMatch: string[],
  shouldNotMatch: string[]
): void {
  shouldMatch.forEach((path) => {
    expect(pattern.test(path)).toBe(true)
  })

  shouldNotMatch.forEach((path) => {
    expect(pattern.test(path)).toBe(false)
  })
}

/**
 * Test helper for validating mapParams with sliced matches
 * (for standard routes that expect sliced match arrays)
 */
export function testMapParamsWithSlicedMatches(
  mapParams: (matches: string[], body?: any) => any,
  testId: string,
  testBody?: any
): any {
  return mapParams([testId], testBody)
}

/**
 * Test helper for validating mapParams with full matches
 * (for custom routes generated by trpcToRest that expect full match arrays)
 */
export function testMapParamsWithFullMatches(
  pattern: RegExp,
  mapParams: (matches: string[], body?: any) => any,
  testPath: string,
  testBody?: any
): any {
  const fullMatch = pattern.exec(testPath)
  return mapParams(fullMatch as any, testBody)
}
