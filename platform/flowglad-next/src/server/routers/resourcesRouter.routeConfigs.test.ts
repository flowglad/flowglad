import { describe, expect, it } from 'vitest'
import { resourcesRouteConfigs } from './resourcesRouter'
import {
  findRouteConfigInArray,
  getAllRouteKeysFromArray,
  validateRouteConfigStructure,
} from './routeConfigs.test-utils'

describe('resourcesRouteConfigs', () => {
  const findRouteConfig = (routeKey: string) => {
    return findRouteConfigInArray(resourcesRouteConfigs, routeKey)
  }

  const getAllRouteKeys = () => {
    return getAllRouteKeysFromArray(resourcesRouteConfigs)
  }

  describe('Route pattern matching and procedure mapping', () => {
    it('maps POST /resources to resources.create procedure and passes body through mapParams', () => {
      const routeConfig = findRouteConfig('POST /resources')

      expect(routeConfig!.procedure).toBe('resources.create')
      expect(routeConfig!.pattern.test('resources')).toBe(true)

      const testBody = {
        resource: {
          slug: 'test-resource',
          name: 'Test Resource',
          pricingModelId: 'pm-123',
        },
      }
      const result = routeConfig!.mapParams([], testBody)
      expect(result).toEqual(testBody)
    })

    it('maps PUT /resources/:id to resources.update procedure and combines id with body in mapParams', () => {
      const routeConfig = findRouteConfig('PUT /resources/:id')

      expect(routeConfig!.procedure).toBe('resources.update')
      expect(routeConfig!.pattern.test('resources/test-id')).toBe(
        true
      )

      const testBody = {
        resource: {
          name: 'Updated Resource',
          metadata: { updated: 'true' },
        },
      }
      const result = routeConfig!.mapParams(['test-id'], testBody)
      expect(result).toEqual({
        ...testBody,
        id: 'test-id',
      })
    })

    it('maps GET /resources/:id to resources.get procedure and extracts id from mapParams', () => {
      const routeConfig = findRouteConfig('GET /resources/:id')

      expect(routeConfig!.procedure).toBe('resources.get')
      expect(routeConfig!.pattern.test('resources/test-id')).toBe(
        true
      )

      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })

    it('maps GET /resources to resources.list procedure and returns undefined from mapParams', () => {
      const routeConfig = findRouteConfig('GET /resources')

      expect(routeConfig!.procedure).toBe('resources.list')
      expect(routeConfig!.pattern.test('resources')).toBe(true)

      const result = routeConfig!.mapParams([])
      expect(result).toBeUndefined()
    })

    it('maps DELETE /resources/:id to resources.delete procedure and extracts id from mapParams', () => {
      const routeConfig = findRouteConfig('DELETE /resources/:id')

      expect(routeConfig!.procedure).toBe('resources.delete')
      expect(routeConfig!.pattern.test('resources/test-id')).toBe(
        true
      )

      const result = routeConfig!.mapParams(['test-id'])
      expect(result).toEqual({ id: 'test-id' })
    })
  })

  describe('Route pattern RegExp validation', () => {
    it('validates that patterns match expected paths and reject invalid paths', () => {
      const createConfig = findRouteConfig('POST /resources')
      expect(createConfig!.pattern.test('resources')).toBe(true)
      expect(createConfig!.pattern.test('resources/id')).toBe(false)

      const getConfig = findRouteConfig('GET /resources/:id')
      expect(getConfig!.pattern.test('resources/abc123')).toBe(true)
      expect(getConfig!.pattern.test('resources')).toBe(false)
      expect(getConfig!.pattern.test('resources/abc123/extra')).toBe(
        false
      )

      const updateConfig = findRouteConfig('PUT /resources/:id')
      expect(updateConfig!.pattern.test('resources/abc123')).toBe(
        true
      )
      expect(updateConfig!.pattern.test('resources')).toBe(false)

      const deleteConfig = findRouteConfig('DELETE /resources/:id')
      expect(deleteConfig!.pattern.test('resources/abc123')).toBe(
        true
      )
      expect(deleteConfig!.pattern.test('resources')).toBe(false)

      const listConfig = findRouteConfig('GET /resources')
      expect(listConfig!.pattern.test('resources')).toBe(true)
      expect(listConfig!.pattern.test('resources/id')).toBe(false)
    })

    it('extracts correct capture groups from URL paths', () => {
      const getConfig = findRouteConfig('GET /resources/:id')
      const getMatches = getConfig!.pattern.exec('resources/test-id')
      expect(typeof getMatches).toBe('object')
      expect(getMatches![1]).toBe('test-id')

      const updateConfig = findRouteConfig('PUT /resources/:id')
      const updateMatches = updateConfig!.pattern.exec(
        'resources/test-id'
      )
      expect(typeof updateMatches).toBe('object')
      expect(updateMatches![1]).toBe('test-id')

      const deleteConfig = findRouteConfig('DELETE /resources/:id')
      const deleteMatches = deleteConfig!.pattern.exec(
        'resources/test-id'
      )
      expect(typeof deleteMatches).toBe('object')
      expect(deleteMatches![1]).toBe('test-id')

      const listConfig = findRouteConfig('GET /resources')
      const listMatches = listConfig!.pattern.exec('resources')
      expect(listMatches).toMatchObject({ length: 1 })
      expect(listMatches!.length).toBe(1)

      const createConfig = findRouteConfig('POST /resources')
      const createMatches = createConfig!.pattern.exec('resources')
      expect(createMatches).toMatchObject({ length: 1 })
      expect(createMatches!.length).toBe(1)
    })
  })

  describe('mapParams function behavior', () => {
    it('maps URL parameters correctly for resources get requests', () => {
      const routeConfig = findRouteConfig('GET /resources/:id')
      const result = routeConfig!.mapParams(['resource-123'])

      expect(result).toEqual({
        id: 'resource-123',
      })
    })

    it('maps URL parameters and body correctly for resources update requests', () => {
      const routeConfig = findRouteConfig('PUT /resources/:id')
      const testBody = {
        resource: {
          name: 'Updated Resource Name',
          metadata: { version: '2' },
        },
      }
      const result = routeConfig!.mapParams(
        ['resource-456'],
        testBody
      )

      expect(result).toEqual({
        resource: {
          name: 'Updated Resource Name',
          metadata: { version: '2' },
        },
        id: 'resource-456',
      })
    })

    it('maps URL parameters to id field for resources delete requests', () => {
      const routeConfig = findRouteConfig('DELETE /resources/:id')
      const result = routeConfig!.mapParams(['resource-789'])

      expect(result).toEqual({
        id: 'resource-789',
      })
    })

    it('returns body for resources create requests', () => {
      const routeConfig = findRouteConfig('POST /resources')
      const testBody = {
        resource: {
          slug: 'new-resource',
          name: 'New Resource',
          pricingModelId: 'pm-new-123',
          metadata: { created: 'via-api' },
        },
      }
      const result = routeConfig!.mapParams([], testBody)

      expect(result).toEqual(testBody)
    })

    it('returns undefined for resources list requests', () => {
      const routeConfig = findRouteConfig('GET /resources')
      const result = routeConfig!.mapParams([])

      expect(result).toBeUndefined()
    })

    it('handles special characters and encoded values in id', () => {
      const routeConfig = findRouteConfig('GET /resources/:id')

      const result1 = routeConfig!.mapParams([
        'resource%40company.com',
      ])
      expect(result1).toEqual({
        id: 'resource%40company.com',
      })

      const result2 = routeConfig!.mapParams(['resource_123-abc'])
      expect(result2).toEqual({ id: 'resource_123-abc' })
    })
  })

  describe('Route config completeness', () => {
    it('includes all expected CRUD route configs', () => {
      const routeKeys = getAllRouteKeys()

      expect(routeKeys).toContain('POST /resources')
      expect(routeKeys).toContain('PUT /resources/:id')
      expect(routeKeys).toContain('GET /resources/:id')
      expect(routeKeys).toContain('GET /resources')
      expect(routeKeys).toContain('DELETE /resources/:id')

      expect(routeKeys).toHaveLength(5)
    })

    it('uses consistent id parameter across all routes requiring an id', () => {
      const idRoutes = [
        'PUT /resources/:id',
        'GET /resources/:id',
        'DELETE /resources/:id',
      ]

      idRoutes.forEach((routeKey) => {
        const config = findRouteConfig(routeKey)
        const result = config!.mapParams(['test-id'], {
          someData: 'value',
        })
        expect(result).toHaveProperty('id', 'test-id')
      })
    })

    it('has valid route config structure for all routes', () => {
      resourcesRouteConfigs.forEach((routeConfigObj) => {
        if (typeof routeConfigObj === 'object') {
          Object.entries(routeConfigObj).forEach(([, config]) => {
            validateRouteConfigStructure(config, 'resources')
          })
        }
      })
    })

    it('maps to correct TRPC procedures', () => {
      const expectedMappings = {
        'POST /resources': 'resources.create',
        'PUT /resources/:id': 'resources.update',
        'GET /resources/:id': 'resources.get',
        'GET /resources': 'resources.list',
        'DELETE /resources/:id': 'resources.delete',
      }

      Object.entries(expectedMappings).forEach(
        ([routeKey, expectedProcedure]) => {
          const config = findRouteConfig(routeKey)
          expect(config!.procedure).toBe(expectedProcedure)
        }
      )
    })

    it('uses array structure from generateOpenApiMetas', () => {
      expect(Array.isArray(resourcesRouteConfigs)).toBe(true)
      expect(resourcesRouteConfigs.length).toBeGreaterThan(0)

      resourcesRouteConfigs.forEach((item) => {
        expect(typeof item).toBe('object')
        const keys = Object.keys(item)
        expect(keys.length).toBeGreaterThan(0)
      })
    })
  })
})
