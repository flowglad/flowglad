import { describe, expect, it } from 'vitest'
import { resourceClaimsRouteConfigs } from './resourceClaimsRouter'
import {
  findRouteConfigInArray,
  getAllRouteKeysFromArray,
  validateRouteConfigStructure,
} from './routeConfigs.test-utils'

describe('resourceClaimsRouteConfigs', () => {
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInArray(
      resourceClaimsRouteConfigs,
      routeKey
    )
  }

  const getAllRouteKeys = () => {
    return getAllRouteKeysFromArray(resourceClaimsRouteConfigs)
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('maps POST /resource-claims/:id/claim to resourceClaims.claim procedure', () => {
      const routeConfig = findRouteConfig(
        'POST /resource-claims/:id/claim'
      )

      expect(routeConfig!.procedure).toBe('resourceClaims.claim')
      expect(
        routeConfig!.pattern.test('resource-claims/sub-123/claim')
      ).toBe(true)
    })

    it('maps POST /resource-claims/:id/release to resourceClaims.release procedure', () => {
      const routeConfig = findRouteConfig(
        'POST /resource-claims/:id/release'
      )

      expect(routeConfig!.procedure).toBe('resourceClaims.release')
      expect(
        routeConfig!.pattern.test('resource-claims/sub-456/release')
      ).toBe(true)
    })

    it('maps GET /resource-claims/:id/usage to resourceClaims.getUsage procedure', () => {
      const routeConfig = findRouteConfig(
        'GET /resource-claims/:id/usage'
      )

      expect(routeConfig!.procedure).toBe('resourceClaims.getUsage')
      expect(
        routeConfig!.pattern.test('resource-claims/sub-789/usage')
      ).toBe(true)
    })

    it('maps POST /resource-claims/:id/listClaims to resourceClaims.listClaims procedure', () => {
      const routeConfig = findRouteConfig(
        'POST /resource-claims/:id/listClaims'
      )

      expect(routeConfig!.procedure).toBe('resourceClaims.listClaims')
      expect(
        routeConfig!.pattern.test(
          'resource-claims/sub-101/listClaims'
        )
      ).toBe(true)
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('validates claim route pattern matches expected paths and rejects invalid paths', () => {
      const claimConfig = findRouteConfig(
        'POST /resource-claims/:id/claim'
      )

      expect(
        claimConfig!.pattern.test('resource-claims/sub-123/claim')
      ).toBe(true)
      expect(
        claimConfig!.pattern.test('resource-claims/sub-123')
      ).toBe(false)
      expect(claimConfig!.pattern.test('resource-claims')).toBe(false)
      expect(
        claimConfig!.pattern.test(
          'resource-claims/sub-123/claim/extra'
        )
      ).toBe(false)
      expect(
        claimConfig!.pattern.test('resource-claims/sub-123/release')
      ).toBe(false)
    })

    it('validates release route pattern matches expected paths and rejects invalid paths', () => {
      const releaseConfig = findRouteConfig(
        'POST /resource-claims/:id/release'
      )

      expect(
        releaseConfig!.pattern.test('resource-claims/sub-123/release')
      ).toBe(true)
      expect(
        releaseConfig!.pattern.test('resource-claims/sub-123')
      ).toBe(false)
      expect(releaseConfig!.pattern.test('resource-claims')).toBe(
        false
      )
      expect(
        releaseConfig!.pattern.test(
          'resource-claims/sub-123/release/extra'
        )
      ).toBe(false)
      expect(
        releaseConfig!.pattern.test('resource-claims/sub-123/claim')
      ).toBe(false)
    })

    it('validates getUsage route pattern matches expected paths and rejects invalid paths', () => {
      const usageConfig = findRouteConfig(
        'GET /resource-claims/:id/usage'
      )

      expect(
        usageConfig!.pattern.test('resource-claims/sub-123/usage')
      ).toBe(true)
      expect(
        usageConfig!.pattern.test('resource-claims/sub-123')
      ).toBe(false)
      expect(usageConfig!.pattern.test('resource-claims')).toBe(false)
      expect(
        usageConfig!.pattern.test(
          'resource-claims/sub-123/usage/extra'
        )
      ).toBe(false)
      expect(
        usageConfig!.pattern.test(
          'resource-claims/sub-123/listClaims'
        )
      ).toBe(false)
    })

    it('validates listClaims route pattern matches expected paths and rejects invalid paths', () => {
      const listConfig = findRouteConfig(
        'POST /resource-claims/:id/listClaims'
      )

      expect(
        listConfig!.pattern.test('resource-claims/sub-123/listClaims')
      ).toBe(true)
      expect(
        listConfig!.pattern.test('resource-claims/sub-123')
      ).toBe(false)
      expect(listConfig!.pattern.test('resource-claims')).toBe(false)
      expect(
        listConfig!.pattern.test(
          'resource-claims/sub-123/listClaims/extra'
        )
      ).toBe(false)
      expect(
        listConfig!.pattern.test('resource-claims/sub-123/usage')
      ).toBe(false)
    })

    it('extracts correct id capture group from URL paths', () => {
      const claimConfig = findRouteConfig(
        'POST /resource-claims/:id/claim'
      )
      const claimMatches = claimConfig!.pattern.exec(
        'resource-claims/test-sub-id/claim'
      )
      expect(typeof claimMatches).toBe('object')
      expect(claimMatches![1]).toBe('test-sub-id')

      const releaseConfig = findRouteConfig(
        'POST /resource-claims/:id/release'
      )
      const releaseMatches = releaseConfig!.pattern.exec(
        'resource-claims/test-sub-id/release'
      )
      expect(typeof releaseMatches).toBe('object')
      expect(releaseMatches![1]).toBe('test-sub-id')

      const usageConfig = findRouteConfig(
        'GET /resource-claims/:id/usage'
      )
      const usageMatches = usageConfig!.pattern.exec(
        'resource-claims/test-sub-id/usage'
      )
      expect(typeof usageMatches).toBe('object')
      expect(usageMatches![1]).toBe('test-sub-id')

      const listConfig = findRouteConfig(
        'POST /resource-claims/:id/listClaims'
      )
      const listMatches = listConfig!.pattern.exec(
        'resource-claims/test-sub-id/listClaims'
      )
      expect(typeof listMatches).toBe('object')
      expect(listMatches![1]).toBe('test-sub-id')
    })
  })

  describe('mapParams function behavior', () => {
    it('claim mapParams includes id and body when called with sliced matches', () => {
      const routeConfig = findRouteConfig(
        'POST /resource-claims/:id/claim'
      )
      const fullMatch = routeConfig!.pattern.exec(
        'resource-claims/subscription-claim-123/claim'
      )
      const testBody = {
        resourceSlug: 'seats',
        quantity: 10,
      }
      // Standard CRUD routes expect sliced matches (match[1:])
      const result = routeConfig!.mapParams(
        fullMatch!.slice(1),
        testBody
      )

      expect(result).toEqual({
        id: 'subscription-claim-123',
        resourceSlug: 'seats',
        quantity: 10,
      })
    })

    it('release mapParams includes id and body when called with sliced matches', () => {
      const routeConfig = findRouteConfig(
        'POST /resource-claims/:id/release'
      )
      const fullMatch = routeConfig!.pattern.exec(
        'resource-claims/subscription-release-789/release'
      )
      const testBody = {
        resourceSlug: 'seats',
        quantity: 5,
      }
      const result = routeConfig!.mapParams(
        fullMatch!.slice(1),
        testBody
      )

      expect(result).toEqual({
        id: 'subscription-release-789',
        resourceSlug: 'seats',
        quantity: 5,
      })
    })

    it('getUsage mapParams returns entity Id when called with full match array', () => {
      const routeConfig = findRouteConfig(
        'GET /resource-claims/:id/usage'
      )
      const fullMatch = routeConfig!.pattern.exec(
        'resource-claims/subscription-usage-202/usage'
      )
      // The getUsage action is treated as a nested resource getter,
      // which expects the full match array (uses matches[1] internally)
      const result = routeConfig!.mapParams(fullMatch as string[])

      // Uses camelCase format: `${camelCase(entity)}Id` becomes `resourceClaimsId`
      expect(result).toEqual({
        resourceClaimsId: 'subscription-usage-202',
      })
    })

    it('listClaims mapParams includes id when called with sliced matches', () => {
      const routeConfig = findRouteConfig(
        'POST /resource-claims/:id/listClaims'
      )
      const fullMatch = routeConfig!.pattern.exec(
        'resource-claims/subscription-list-404/listClaims'
      )
      const result = routeConfig!.mapParams(fullMatch!.slice(1))

      expect(result).toEqual({
        id: 'subscription-list-404',
      })
    })

    it('handles special characters in id with sliced matches', () => {
      const routeConfig = findRouteConfig(
        'POST /resource-claims/:id/claim'
      )

      const fullMatch1 = routeConfig!.pattern.exec(
        'resource-claims/sub%40company.com/claim'
      )
      const result1 = routeConfig!.mapParams(fullMatch1!.slice(1), {
        resourceSlug: 'seats',
        quantity: 1,
      })
      expect(result1).toEqual({
        id: 'sub%40company.com',
        resourceSlug: 'seats',
        quantity: 1,
      })

      const fullMatch2 = routeConfig!.pattern.exec(
        'resource-claims/sub_123-abc/claim'
      )
      const result2 = routeConfig!.mapParams(fullMatch2!.slice(1), {
        resourceSlug: 'seats',
        quantity: 1,
      })
      expect(result2).toEqual({
        id: 'sub_123-abc',
        resourceSlug: 'seats',
        quantity: 1,
      })
    })
  })

  describe('Route config completeness', () => {
    it('includes all expected custom route configs for resource claims operations', () => {
      const routeKeys = getAllRouteKeys()

      expect(routeKeys).toContain('POST /resource-claims/:id/claim')
      expect(routeKeys).toContain('POST /resource-claims/:id/release')
      expect(routeKeys).toContain('GET /resource-claims/:id/usage')
      expect(routeKeys).toContain(
        'POST /resource-claims/:id/listClaims'
      )

      expect(routeKeys).toHaveLength(4)
    })

    it('extracts id from routes with correct mapParams invocation per route type', () => {
      // Custom action routes (claim, release, listClaims) expect sliced matches
      const slicedMatchRoutes = [
        {
          key: 'POST /resource-claims/:id/claim',
          path: 'resource-claims/test-sub/claim',
          idKey: 'id',
        },
        {
          key: 'POST /resource-claims/:id/release',
          path: 'resource-claims/test-sub/release',
          idKey: 'id',
        },
        {
          key: 'POST /resource-claims/:id/listClaims',
          path: 'resource-claims/test-sub/listClaims',
          idKey: 'id',
        },
      ]

      slicedMatchRoutes.forEach(({ key, path, idKey }) => {
        const config = findRouteConfig(key)
        const fullMatch = config!.pattern.exec(path)
        const result = config!.mapParams(fullMatch!.slice(1), {
          resourceSlug: 'seats',
        })
        expect(result).toHaveProperty(idKey, 'test-sub')
      })

      // Nested resource getter (getUsage) expects full match array
      const usageConfig = findRouteConfig(
        'GET /resource-claims/:id/usage'
      )
      const usageMatch = usageConfig!.pattern.exec(
        'resource-claims/test-sub/usage'
      )
      const usageResult = usageConfig!.mapParams(
        usageMatch as string[]
      )
      expect(usageResult).toHaveProperty(
        'resourceClaimsId',
        'test-sub'
      )
    })

    it('has valid route config structure for all routes', () => {
      resourceClaimsRouteConfigs.forEach((routeConfigObj) => {
        if (typeof routeConfigObj === 'object') {
          Object.entries(routeConfigObj).forEach(([, config]) => {
            validateRouteConfigStructure(config, 'resourceClaims')
          })
        }
      })
    })

    it('maps to correct TRPC procedures', () => {
      const expectedMappings = {
        'POST /resource-claims/:id/claim': 'resourceClaims.claim',
        'POST /resource-claims/:id/release': 'resourceClaims.release',
        'GET /resource-claims/:id/usage': 'resourceClaims.getUsage',
        'POST /resource-claims/:id/listClaims':
          'resourceClaims.listClaims',
      }

      Object.entries(expectedMappings).forEach(
        ([routeKey, expectedProcedure]) => {
          const config = findRouteConfig(routeKey)
          expect(config!.procedure).toBe(expectedProcedure)
        }
      )
    })

    it('uses array structure from trpcToRest utility', () => {
      expect(Array.isArray(resourceClaimsRouteConfigs)).toBe(true)
      expect(resourceClaimsRouteConfigs.length).toBeGreaterThan(0)

      resourceClaimsRouteConfigs.forEach((item) => {
        expect(typeof item).toBe('object')
        const keys = Object.keys(item)
        expect(keys.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Custom route behavior with id parameter', () => {
    it('differentiates between claim and release actions for the same subscription', () => {
      const claimConfig = findRouteConfig(
        'POST /resource-claims/:id/claim'
      )
      const releaseConfig = findRouteConfig(
        'POST /resource-claims/:id/release'
      )

      const claimPath = 'resource-claims/sub-same/claim'
      const releasePath = 'resource-claims/sub-same/release'

      expect(claimConfig!.pattern.test(claimPath)).toBe(true)
      expect(claimConfig!.pattern.test(releasePath)).toBe(false)

      expect(releaseConfig!.pattern.test(releasePath)).toBe(true)
      expect(releaseConfig!.pattern.test(claimPath)).toBe(false)
    })

    it('differentiates between usage and listClaims for the same subscription', () => {
      const usageConfig = findRouteConfig(
        'GET /resource-claims/:id/usage'
      )
      const listConfig = findRouteConfig(
        'POST /resource-claims/:id/listClaims'
      )

      const usagePath = 'resource-claims/sub-same/usage'
      const listPath = 'resource-claims/sub-same/listClaims'

      expect(usageConfig!.pattern.test(usagePath)).toBe(true)
      expect(usageConfig!.pattern.test(listPath)).toBe(false)

      expect(listConfig!.pattern.test(listPath)).toBe(true)
      expect(listConfig!.pattern.test(usagePath)).toBe(false)
    })
  })
})
