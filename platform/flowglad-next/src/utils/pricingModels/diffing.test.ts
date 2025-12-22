import { describe, expect, it } from 'vitest'
import { diffSluggedResources, type SluggedResource } from './diffing'

type SlugAndName = SluggedResource<{ name: string }>

describe('diffSluggedResources', () => {
  it('should identify resources to remove when slug exists only in existing', () => {
    // Setup: existing has 'foo' and 'bar', proposed only has 'bar'
    const existing: SlugAndName[] = [
      { slug: 'foo', name: 'Foo' },
      { slug: 'bar', name: 'Bar' },
    ]
    const proposed: SlugAndName[] = [{ slug: 'bar', name: 'Bar' }]

    const result = diffSluggedResources(existing, proposed)

    // Expectation: 'foo' should be in toRemove
    expect(result.toRemove).toEqual([{ slug: 'foo', name: 'Foo' }])
    expect(result.toCreate).toEqual([])
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].existing.slug).toBe('bar')
  })

  it('should identify resources to create when slug exists only in proposed', () => {
    // Setup: existing only has 'foo', proposed has 'foo' and 'bar'
    const existing: SlugAndName[] = [{ slug: 'foo', name: 'Foo' }]
    const proposed: SlugAndName[] = [
      { slug: 'foo', name: 'Foo' },
      { slug: 'bar', name: 'Bar' },
    ]

    const result = diffSluggedResources(existing, proposed)

    // Expectation: 'bar' should be in toCreate
    expect(result.toRemove).toEqual([])
    expect(result.toCreate).toEqual([{ slug: 'bar', name: 'Bar' }])
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].existing.slug).toBe('foo')
  })

  it('should identify resources to update when slug exists in both', () => {
    // Setup: both have 'foo' with different names
    const existing: SlugAndName[] = [{ slug: 'foo', name: 'Old' }]
    const proposed: SlugAndName[] = [{ slug: 'foo', name: 'New' }]

    const result = diffSluggedResources(existing, proposed)

    // Expectation: 'foo' should be in toUpdate with both versions
    expect(result.toRemove).toEqual([])
    expect(result.toCreate).toEqual([])
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0]).toEqual({
      existing: { slug: 'foo', name: 'Old' },
      proposed: { slug: 'foo', name: 'New' },
    })
  })

  it('should handle empty existing array', () => {
    // Setup: no existing resources, proposed has 'foo'
    const existing: SlugAndName[] = []
    const proposed: SlugAndName[] = [{ slug: 'foo', name: 'Foo' }]

    const result = diffSluggedResources(existing, proposed)

    // Expectation: 'foo' should be in toCreate
    expect(result.toRemove).toEqual([])
    expect(result.toCreate).toEqual([{ slug: 'foo', name: 'Foo' }])
    expect(result.toUpdate).toEqual([])
  })

  it('should handle empty proposed array', () => {
    // Setup: existing has 'foo', no proposed resources
    const existing: SlugAndName[] = [{ slug: 'foo', name: 'Foo' }]
    const proposed: SlugAndName[] = []

    const result = diffSluggedResources(existing, proposed)

    // Expectation: 'foo' should be in toRemove
    expect(result.toRemove).toEqual([{ slug: 'foo', name: 'Foo' }])
    expect(result.toCreate).toEqual([])
    expect(result.toUpdate).toEqual([])
  })

  it('should handle completely different slugs as remove + create', () => {
    // Setup: existing has 'foo', proposed has 'bar'
    const existing: SlugAndName[] = [{ slug: 'foo', name: 'Foo' }]
    const proposed: SlugAndName[] = [{ slug: 'bar', name: 'Bar' }]

    const result = diffSluggedResources(existing, proposed)

    // Expectation: 'foo' in toRemove, 'bar' in toCreate
    expect(result.toRemove).toEqual([{ slug: 'foo', name: 'Foo' }])
    expect(result.toCreate).toEqual([{ slug: 'bar', name: 'Bar' }])
    expect(result.toUpdate).toEqual([])
  })

  it('should handle multiple resources with mixed changes', () => {
    // Setup: complex scenario with remove, create, and update
    const existing: SluggedResource<{
      name: string
      active: boolean
    }>[] = [
      { slug: 'remove-me', name: 'Remove', active: true },
      { slug: 'update-me', name: 'Old Name', active: true },
      { slug: 'keep-same', name: 'Same', active: true },
    ]
    const proposed: SluggedResource<{
      name: string
      active: boolean
    }>[] = [
      { slug: 'update-me', name: 'New Name', active: false },
      { slug: 'keep-same', name: 'Same', active: true },
      { slug: 'create-me', name: 'New', active: true },
    ]

    const result = diffSluggedResources(existing, proposed)

    // Expectation: proper categorization of all changes
    expect(result.toRemove).toHaveLength(1)
    expect(result.toRemove[0].slug).toBe('remove-me')

    expect(result.toCreate).toHaveLength(1)
    expect(result.toCreate[0].slug).toBe('create-me')

    expect(result.toUpdate).toHaveLength(2)
    const updateSlugs = result.toUpdate
      .map((u) => u.existing.slug)
      .sort()
    expect(updateSlugs).toEqual(['keep-same', 'update-me'])
  })

  it('should preserve resource properties in diff results', () => {
    // Setup: resources with multiple properties
    type ComplexResource = {
      slug: string
      name: string
      description: string
      active: boolean
      metadata: { foo: string }
    }

    const existing: SluggedResource<ComplexResource>[] = [
      {
        slug: 'test',
        name: 'Test',
        description: 'Old description',
        active: true,
        metadata: { foo: 'bar' },
      },
    ]
    const proposed: SluggedResource<ComplexResource>[] = [
      {
        slug: 'test',
        name: 'Test Updated',
        description: 'New description',
        active: false,
        metadata: { foo: 'baz' },
      },
    ]

    const result = diffSluggedResources(existing, proposed)

    // Expectation: all properties preserved in toUpdate
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].existing).toEqual(existing[0])
    expect(result.toUpdate[0].proposed).toEqual(proposed[0])
    expect(result.toUpdate[0].proposed.metadata.foo).toBe('baz')
  })

  it('should work with minimal resource type (only slug)', () => {
    // Setup: resources with only slug property
    const existing: SluggedResource<object>[] = [{ slug: 'minimal' }]
    const proposed: SluggedResource<object>[] = [{ slug: 'minimal' }]

    const result = diffSluggedResources(existing, proposed)

    // Expectation: diffing works even with minimal type
    expect(result.toRemove).toEqual([])
    expect(result.toCreate).toEqual([])
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].existing.slug).toBe('minimal')
  })
})
