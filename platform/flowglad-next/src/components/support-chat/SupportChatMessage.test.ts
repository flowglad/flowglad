import { describe, expect, it } from 'bun:test'
import {
  getSourceDisplayName,
  getSourceUrl,
} from './SupportChatMessage'

// Pure function tests - no beforeEach setup needed

describe('getSourceUrl', () => {
  it('removes .mdx extension and prepends docs.flowglad.com', () => {
    const result = getSourceUrl('sdks/nextjs.mdx')

    expect(result).toBe('https://docs.flowglad.com/sdks/nextjs')
  })

  it('handles path without .mdx extension', () => {
    const result = getSourceUrl('guides/getting-started')

    expect(result).toBe(
      'https://docs.flowglad.com/guides/getting-started'
    )
  })

  it('handles path already starting with slash without creating double slash', () => {
    const result = getSourceUrl('/concepts/products.mdx')

    // Should NOT have double slash in the path portion (after the domain)
    expect(result).toBe('https://docs.flowglad.com/concepts/products')
    // Check that there's no double slash after the domain
    expect(result.replace('https://', '')).not.toContain('//')
  })

  it('handles path without leading slash by adding one', () => {
    const result = getSourceUrl('api-reference/overview')

    expect(result).toBe(
      'https://docs.flowglad.com/api-reference/overview'
    )
  })
})

describe('getSourceDisplayName', () => {
  it('returns title when title is provided', () => {
    const result = getSourceDisplayName({
      title: 'Getting Started Guide',
      path: 'guides/getting-started',
    })

    expect(result).toBe('Getting Started Guide')
  })

  it('converts kebab-case path segment to Title Case when no title', () => {
    const result = getSourceDisplayName({
      path: 'guides/getting-started.mdx',
    })

    expect(result).toBe('Getting Started')
  })

  it('uses last path segment when path has multiple segments', () => {
    const result = getSourceDisplayName({
      path: 'sdks/react/use-customer-portal.mdx',
    })

    expect(result).toBe('Use Customer Portal')
  })

  it('returns Documentation fallback when path is just slash', () => {
    const result = getSourceDisplayName({ path: '/' })

    expect(result).toBe('Documentation')
  })

  it('handles single segment path', () => {
    const result = getSourceDisplayName({ path: 'introduction.mdx' })

    expect(result).toBe('Introduction')
  })

  it('handles empty title by falling back to path parsing', () => {
    // Empty string is falsy, so should fall back to path parsing
    const result = getSourceDisplayName({
      title: '',
      path: 'concepts/billing-overview.mdx',
    })

    expect(result).toBe('Billing Overview')
  })
})
