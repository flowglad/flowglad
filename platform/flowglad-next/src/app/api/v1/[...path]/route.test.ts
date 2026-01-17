import { describe, expect, it } from 'bun:test'
import { searchParamsToObject } from '@/utils/url'

describe('searchParamsToObject', () => {
  it('should convert empty URLSearchParams to empty object', () => {
    const params = new URLSearchParams()
    const result = searchParamsToObject(params)

    expect(result).toEqual({})
  })

  it('should convert single query parameter to object with string value', () => {
    const params = new URLSearchParams('limit=10')
    const result = searchParamsToObject(params)

    expect(result).toEqual({ limit: '10' })
  })

  it('should convert multiple different query parameters to object', () => {
    const params = new URLSearchParams(
      'limit=10&cursor=abc123&status=active'
    )
    const result = searchParamsToObject(params)

    expect(result).toEqual({
      limit: '10',
      cursor: 'abc123',
      status: 'active',
    })
  })

  it('should convert duplicate query parameters to array', () => {
    const params = new URLSearchParams(
      'tags=javascript&tags=typescript&tags=react'
    )
    const result = searchParamsToObject(params)

    expect(result).toEqual({
      tags: ['javascript', 'typescript', 'react'],
    })
  })

  it('should handle mix of single and duplicate parameters', () => {
    const params = new URLSearchParams(
      'limit=10&tags=javascript&tags=typescript&status=active'
    )
    const result = searchParamsToObject(params)

    expect(result).toEqual({
      limit: '10',
      tags: ['javascript', 'typescript'],
      status: 'active',
    })
  })

  it('should handle parameters with empty values', () => {
    const params = new URLSearchParams('search=&limit=10')
    const result = searchParamsToObject(params)

    expect(result).toEqual({
      search: '',
      limit: '10',
    })
  })

  it('should handle URL-encoded parameters', () => {
    const params = new URLSearchParams(
      'name=John%20Doe&email=test%40example.com'
    )
    const result = searchParamsToObject(params)

    expect(result).toEqual({
      name: 'John Doe',
      email: 'test@example.com',
    })
  })

  it('should handle parameters with special characters', () => {
    const params = new URLSearchParams(
      'filter[name]=test&sort=-createdAt'
    )
    const result = searchParamsToObject(params)

    expect(result).toEqual({
      'filter[name]': 'test',
      sort: '-createdAt',
    })
  })

  it('should maintain order when building array from duplicates', () => {
    const params = new URLSearchParams('id=1&id=2&id=3')
    const result = searchParamsToObject(params)

    expect(result).toEqual({
      id: ['1', '2', '3'],
    })
    expect(result.id).toEqual(['1', '2', '3']) // Verify order is preserved
  })

  it('should handle complex pagination parameters', () => {
    const params = new URLSearchParams(
      'limit=20&cursor=eyJpZCI6MTIzfQ==&direction=forward'
    )
    const result = searchParamsToObject(params)

    expect(result).toEqual({
      limit: '20',
      cursor: 'eyJpZCI6MTIzfQ==',
      direction: 'forward',
    })
  })

  it('should handle boolean-like string parameters', () => {
    const params = new URLSearchParams(
      'includeDeleted=true&active=false'
    )
    const result = searchParamsToObject(params)

    expect(result).toEqual({
      includeDeleted: 'true',
      active: 'false',
    })
  })
})
