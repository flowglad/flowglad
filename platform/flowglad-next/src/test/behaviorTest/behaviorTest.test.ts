/**
 * Behavioral Testing Framework - Unit Tests
 *
 * Tests the framework itself with simple mock dependencies.
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  behaviorTest,
  clearImplementations,
  combinationMatches,
  Dependency,
  defineBehavior,
  formatCombination,
  generateCombinations,
  runBehavior,
} from './index'

// ============================================================================
// Mock Dependencies for Unit Tests (cleared after each test)
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
// Mock Dependencies for behaviorTest Integration Tests
// (Registered at module level, not cleared between tests)
// ============================================================================

interface BehaviorTestGreeter {
  greet(name: string): string
  language: string
}

abstract class BehaviorTestGreeterDep extends Dependency<BehaviorTestGreeter>() {
  abstract greet(name: string): string
  abstract language: string
}

interface BehaviorTestFormatter {
  format(text: string): string
  style: string
}

abstract class BehaviorTestFormatterDep extends Dependency<BehaviorTestFormatter>() {
  abstract format(text: string): string
  abstract style: string
}

// ============================================================================
// Setup/Teardown for Unit Tests
// ============================================================================

afterEach(() => {
  // Only clear the unit test dependencies, not the behaviorTest integration test ones
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

  it('returns fresh instances to prevent state leakage between tests', () => {
    MockGreeterDep.implement('mutable', {
      language: 'en',
      greet: (name: string) => `Hello, ${name}!`,
    })

    const instance1 = MockGreeterDep.get('mutable')
    const instance2 = MockGreeterDep.get('mutable')

    // Instances should be different objects
    expect(instance1).not.toBe(instance2)

    // Mutating one instance should not affect the other
    instance1.language = 'modified'
    expect(instance1.language).toBe('modified')
    expect(instance2.language).toBe('en')
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

  it('combinationMatches returns true when filter is subset of combination', () => {
    const combination = {
      MockGreeterDep: 'english',
      MockFormatterDep: 'upper',
    }

    // Exact match
    expect(
      combinationMatches(combination, {
        MockGreeterDep: 'english',
        MockFormatterDep: 'upper',
      })
    ).toBe(true)

    // Partial match (filter is subset)
    expect(
      combinationMatches(combination, { MockGreeterDep: 'english' })
    ).toBe(true)
    expect(
      combinationMatches(combination, { MockFormatterDep: 'upper' })
    ).toBe(true)

    // Empty filter matches everything
    expect(combinationMatches(combination, {})).toBe(true)
  })

  it('combinationMatches returns false when filter does not match', () => {
    const combination = {
      MockGreeterDep: 'english',
      MockFormatterDep: 'upper',
    }

    // Different value for same key
    expect(
      combinationMatches(combination, { MockGreeterDep: 'spanish' })
    ).toBe(false)

    // One key matches, one doesn't
    expect(
      combinationMatches(combination, {
        MockGreeterDep: 'english',
        MockFormatterDep: 'lower',
      })
    ).toBe(false)

    // Key doesn't exist in combination
    expect(
      combinationMatches(combination, { NonExistentDep: 'value' })
    ).toBe(false)
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

// ============================================================================
// behaviorTest Integration Tests
// ============================================================================
// NOTE: behaviorTest() calls describe()/it() internally, so these tests
// must register implementations BEFORE calling behaviorTest() at the
// describe level (not inside it() blocks).

// Register implementations for single-dependency test
BehaviorTestGreeterDep.implement('english', {
  language: 'en',
  greet: (name: string) => `Hello, ${name}!`,
})
BehaviorTestGreeterDep.implement('spanish', {
  language: 'es',
  greet: (name: string) => `Hola, ${name}!`,
})

const greetBehavior = defineBehavior({
  name: 'greet',
  dependencies: [BehaviorTestGreeterDep],
  run: async ({ behaviorTestGreeterDep }, _prev: undefined) => {
    const greeting = behaviorTestGreeterDep.greet('World')
    return { greeting, language: behaviorTestGreeterDep.language }
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
        expect(['en', 'es']).toContain(result.language)
      },
    },
  ],
})

// Register implementations for chained behavior test
BehaviorTestFormatterDep.implement('upper', {
  style: 'uppercase',
  format: (t: string) => t.toUpperCase(),
})
BehaviorTestFormatterDep.implement('lower', {
  style: 'lowercase',
  format: (t: string) => t.toLowerCase(),
})

const greetForChainBehavior = defineBehavior({
  name: 'greet for chain',
  dependencies: [BehaviorTestGreeterDep],
  run: async ({ behaviorTestGreeterDep }, _prev: undefined) => {
    const greeting = behaviorTestGreeterDep.greet('World')
    return { greeting }
  },
})

const formatBehavior = defineBehavior({
  name: 'format',
  dependencies: [BehaviorTestFormatterDep],
  run: async (
    { behaviorTestFormatterDep },
    prev: { greeting: string }
  ) => {
    const formatted = behaviorTestFormatterDep.format(prev.greeting)
    return { ...prev, formatted }
  },
})

// This creates 4 test cases (english+upper, english+lower, spanish+upper, spanish+lower)
behaviorTest({
  chain: [
    {
      behavior: greetForChainBehavior,
      invariants: (result) => {
        expect(result.greeting).toContain('World')
      },
    },
    {
      behavior: formatBehavior,
      invariants: (result) => {
        // Formatted version contains the original greeting text
        expect(result.formatted.toLowerCase()).toContain('world')
      },
    },
  ],
})
