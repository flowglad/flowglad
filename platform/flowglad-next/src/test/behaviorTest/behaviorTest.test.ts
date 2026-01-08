/**
 * Behavioral Testing Framework - Unit Tests
 *
 * Tests the framework itself with simple mock dependencies.
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  behaviorTest,
  defineBehavior,
  runBehavior,
  Dependency,
  clearImplementations,
  generateCombinations,
  formatCombination,
} from './index'

// ============================================================================
// Mock Dependencies for Testing the Framework
// ============================================================================

/**
 * MockGreeterDep - A simple dependency for testing.
 * Uses the clean Dependency<T>() base class syntax.
 */
interface MockGreeter {
  greet(name: string): string
  language: string
}

abstract class MockGreeterDep extends Dependency<MockGreeter>() {
  abstract greet(name: string): string
  abstract language: string
}

/**
 * MockFormatterDep - Another dependency for testing cartesian product.
 */
interface MockFormatter {
  format(text: string): string
  style: string
}

abstract class MockFormatterDep extends Dependency<MockFormatter>() {
  abstract format(text: string): string
  abstract style: string
}

// ============================================================================
// Setup/Teardown
// ============================================================================

afterEach(() => {
  clearImplementations(MockGreeterDep)
  clearImplementations(MockFormatterDep)
})

// ============================================================================
// Unit Tests
// ============================================================================

describe('Dependency registration', () => {
  it('registers and retrieves implementations', () => {
    MockGreeterDep.implement('english', {
      language: 'en',
      greet: (name: string) => `Hello, ${name}!`,
    })

    MockGreeterDep.implement('spanish', {
      language: 'es',
      greet: (name: string) => `Hola, ${name}!`,
    })

    const english = MockGreeterDep.get('english')
    const spanish = MockGreeterDep.get('spanish')

    expect(english.greet('World')).toBe('Hello, World!')
    expect(english.language).toBe('en')
    expect(spanish.greet('Mundo')).toBe('Hola, Mundo!')
    expect(spanish.language).toBe('es')
  })

  it('throws when getting unregistered implementation', () => {
    expect(() => MockGreeterDep.get('french')).toThrow(
      /No implementations registered/
    )
  })

  it('getAll returns all registered implementations', () => {
    MockGreeterDep.implement('english', {
      language: 'en',
      greet: (name: string) => `Hello, ${name}!`,
    })

    MockGreeterDep.implement('spanish', {
      language: 'es',
      greet: (name: string) => `Hola, ${name}!`,
    })

    const all = MockGreeterDep.getAll()
    expect(all.size).toBe(2)
    expect(all.has('english')).toBe(true)
    expect(all.has('spanish')).toBe(true)
  })
})

describe('Cartesian product generation', () => {
  it('generates all combinations for single dependency', () => {
    MockGreeterDep.implement('english', {
      language: 'en',
      greet: () => 'Hello',
    })
    MockGreeterDep.implement('spanish', {
      language: 'es',
      greet: () => 'Hola',
    })

    const combinations = generateCombinations([MockGreeterDep])
    expect(combinations).toHaveLength(2)
    expect(combinations).toContainEqual({ MockGreeterDep: 'english' })
    expect(combinations).toContainEqual({ MockGreeterDep: 'spanish' })
  })

  it('generates cartesian product for multiple dependencies', () => {
    MockGreeterDep.implement('english', {
      language: 'en',
      greet: () => 'Hello',
    })
    MockGreeterDep.implement('spanish', {
      language: 'es',
      greet: () => 'Hola',
    })

    MockFormatterDep.implement('upper', {
      style: 'uppercase',
      format: (t: string) => t.toUpperCase(),
    })
    MockFormatterDep.implement('lower', {
      style: 'lowercase',
      format: (t: string) => t.toLowerCase(),
    })

    const combinations = generateCombinations([
      MockGreeterDep,
      MockFormatterDep,
    ])
    expect(combinations).toHaveLength(4)
    expect(combinations).toContainEqual({
      MockGreeterDep: 'english',
      MockFormatterDep: 'upper',
    })
    expect(combinations).toContainEqual({
      MockGreeterDep: 'english',
      MockFormatterDep: 'lower',
    })
    expect(combinations).toContainEqual({
      MockGreeterDep: 'spanish',
      MockFormatterDep: 'upper',
    })
    expect(combinations).toContainEqual({
      MockGreeterDep: 'spanish',
      MockFormatterDep: 'lower',
    })
  })

  it('formats combinations for test names', () => {
    const formatted = formatCombination({
      MockGreeterDep: 'english',
      MockFormatterDep: 'upper',
    })
    expect(formatted).toBe(
      'MockGreeterDep=english, MockFormatterDep=upper'
    )
  })
})

describe('defineBehavior', () => {
  it('creates a behavior definition', () => {
    MockGreeterDep.implement('english', {
      language: 'en',
      greet: (name: string) => `Hello, ${name}!`,
    })

    const greetBehavior = defineBehavior({
      name: 'greet',
      dependencies: [MockGreeterDep],
      run: async ({ mockGreeterDep }, prev: { name: string }) => {
        const greeting = mockGreeterDep.greet(prev.name)
        return { ...prev, greeting }
      },
    })

    expect(greetBehavior.name).toBe('greet')
    expect(greetBehavior.dependencies).toEqual([MockGreeterDep])
  })
})

describe('runBehavior', () => {
  it('runs a behavior with specific dependencies', async () => {
    MockGreeterDep.implement('english', {
      language: 'en',
      greet: (name: string) => `Hello, ${name}!`,
    })

    const greetBehavior = defineBehavior({
      name: 'greet',
      dependencies: [MockGreeterDep],
      run: async ({ mockGreeterDep }, prev: { name: string }) => {
        const greeting = mockGreeterDep.greet(prev.name)
        return { ...prev, greeting }
      },
    })

    const result = await runBehavior(
      greetBehavior,
      { mockGreeterDep: MockGreeterDep.get('english') },
      { name: 'World' }
    )

    expect(result.name).toBe('World')
    expect(result.greeting).toBe('Hello, World!')
  })
})

describe('behaviorTest', () => {
  it('runs behavior against all combinations with invariants', () => {
    MockGreeterDep.implement('english', {
      language: 'en',
      greet: (name: string) => `Hello, ${name}!`,
    })
    MockGreeterDep.implement('spanish', {
      language: 'es',
      greet: (name: string) => `Hola, ${name}!`,
    })

    const greetBehavior = defineBehavior({
      name: 'greet',
      dependencies: [MockGreeterDep],
      run: async ({ mockGreeterDep }, _prev: undefined) => {
        const greeting = mockGreeterDep.greet('World')
        return { greeting, language: mockGreeterDep.language }
      },
    })

    // This creates a describe block with 2 it blocks (one per implementation)
    behaviorTest({
      chain: [
        {
          behavior: greetBehavior,
          invariants: (result) => {
            // Universal invariants - must pass for ALL implementations
            expect(result.greeting).toContain('World')
            expect(result.language).toBeTruthy()
          },
        },
      ],
    })
  })

  it('chains behaviors with state passing', () => {
    MockGreeterDep.implement('english', {
      language: 'en',
      greet: (name: string) => `Hello, ${name}!`,
    })

    MockFormatterDep.implement('upper', {
      style: 'uppercase',
      format: (t: string) => t.toUpperCase(),
    })
    MockFormatterDep.implement('lower', {
      style: 'lowercase',
      format: (t: string) => t.toLowerCase(),
    })

    const greetBehavior = defineBehavior({
      name: 'greet',
      dependencies: [MockGreeterDep],
      run: async ({ mockGreeterDep }, _prev: undefined) => {
        const greeting = mockGreeterDep.greet('World')
        return { greeting }
      },
    })

    const formatBehavior = defineBehavior({
      name: 'format',
      dependencies: [MockFormatterDep],
      run: async (
        { mockFormatterDep },
        prev: { greeting: string }
      ) => {
        const formatted = mockFormatterDep.format(prev.greeting)
        return { ...prev, formatted }
      },
    })

    // This creates 2 test cases (english + upper, english + lower)
    behaviorTest({
      chain: [
        {
          behavior: greetBehavior,
          invariants: (result) => {
            expect(result.greeting).toBe('Hello, World!')
          },
        },
        {
          behavior: formatBehavior,
          invariants: (result) => {
            // Formatted version contains the original greeting text
            expect(result.formatted.toLowerCase()).toContain('hello')
            expect(result.formatted.toLowerCase()).toContain('world')
          },
        },
      ],
    })
  })
})
