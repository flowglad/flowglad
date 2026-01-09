/**
 * Behavioral Testing Framework - Type Definitions
 */

/**
 * Factory function that creates a dependency instance.
 * Called fresh for each test combination to ensure isolation.
 */
export type DependencyFactory<T> = () => T

/**
 * Teardown function signature for dependency implementations.
 * Called once after all tests complete, receives all results from tests
 * that used this implementation.
 *
 * @typeParam TResult - The final result type from the behavior chain
 */
export type TeardownFn<TResult = unknown> = (
  results: TResult[]
) => void | Promise<void>

/**
 * Abstract class constructor type for dependency classes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DependencyClass<T = any> = abstract new (
  ...args: unknown[]
) => T

/**
 * A combination represents one specific set of implementation choices.
 * Maps dependency class names to implementation names.
 * Example: { ResidencyDep: 'us', OrgTypeDep: 'standard' }
 */
export type DependencyCombination = Record<string, string>

/**
 * Resolved dependencies passed to behavior run function.
 * Keys are uncapitalized class names (e.g., OrgTypeDep -> orgTypeDep).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ResolvedDependencies = Record<string, any>

/**
 * Behavior definition: the core reusable unit.
 * Contains only operations, returns a result for assertions.
 *
 * @typeParam TDeps - Array of dependency classes
 * @typeParam TResult - The result type returned by run
 * @typeParam TPrev - The previous state type (undefined for first behavior in chain)
 */
export interface BehaviorDefinition<
  TDeps extends DependencyClass[],
  TResult,
  TPrev = undefined,
> {
  /** Human-readable name for test output */
  name: string

  /** Array of dependency classes this behavior requires */
  dependencies: TDeps

  /** The operation sequence - receives resolved dependencies and previous state, returns result */
  run: (deps: ResolvedDependencies, prev: TPrev) => Promise<TResult>
}

/**
 * A step in a behavior chain - pairs a behavior with its invariants.
 */
export interface ChainStep<
  TDeps extends DependencyClass[],
  TResult,
  TPrev = undefined,
> {
  /** The behavior to run */
  behavior: BehaviorDefinition<TDeps, TResult, TPrev>

  /** Universal invariants that must hold for ALL dependency combinations */
  invariants?: (
    result: TResult,
    combination: DependencyCombination
  ) => void | Promise<void>
}

/**
 * Type for the describe function used in behavior tests.
 * Compatible with Vitest's describe function or custom wrappers like describeIfStripeKey.
 */
export type DescribeFunction = (name: string, fn: () => void) => void

/**
 * Configuration for running a behavior test.
 */
export interface BehaviorTestConfig {
  /** Chain of behaviors to run with assertion points between each */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chain: ChainStep<any, any, any>[]

  /** Optional: Vitest test options like timeout */
  testOptions?: { timeout?: number }

  /** Optional: Filter to run only specific combinations */
  only?: DependencyCombination[]

  /** Optional: Skip specific combinations */
  skip?: DependencyCombination[]

  /**
   * Optional: Custom describe function for conditional test execution.
   * Use this with helpers like `describeIfStripeKey` to skip tests when
   * external dependencies (like Stripe credentials) are unavailable.
   *
   * @default vitest's describe
   * @example
   * ```typescript
   * import { describeIfStripeKey } from '@/test/stripeIntegrationHelpers'
   *
   * behaviorTest({
   *   chain: [...],
   *   describeFunction: describeIfStripeKey,
   * })
   * ```
   */
  describeFunction?: DescribeFunction

  /**
   * Optional: Teardown function called after all tests complete.
   * Receives all final results from the behavior chain.
   * Use this to clean up resources created during tests.
   *
   * @example
   * ```typescript
   * behaviorTest({
   *   chain: [...],
   *   teardown: async (results) => {
   *     for (const result of results) {
   *       await teardownOrg({ organizationId: result.organization.id })
   *     }
   *   }
   * })
   * ```
   */
  teardown?: TeardownFn
}
