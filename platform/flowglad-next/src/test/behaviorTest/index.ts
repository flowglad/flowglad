/**
 * Behavioral Testing Framework
 *
 * A framework for testing behaviors across the cartesian product of
 * dependency implementations with universal invariants.
 *
 * @example
 * ```typescript
 * // 1. Define return types, then the dependency interface and abstract class
 * type CreateCustomerResult = Promise<Customer.Record>
 *
 * interface Residency {
 *   createCustomer(orgId: string): CreateCustomerResult
 *   countryCode: string
 * }
 *
 * abstract class ResidencyDep extends Dependency<Residency>() {
 *   abstract createCustomer(orgId: string): CreateCustomerResult
 *   abstract countryCode: string
 * }
 *
 * // 2. Implement each variant
 * ResidencyDep.implement('us', {
 *   countryCode: 'US',
 *   createCustomer: (orgId) => setupCustomer({ organizationId: orgId })
 * })
 *
 * ResidencyDep.implement('eu', {
 *   countryCode: 'DE',
 *   createCustomer: (orgId) => setupCustomer({ organizationId: orgId })
 * })
 *
 * // 3. Define behaviors
 * const createCustomerBehavior = defineBehavior({
 *   name: 'create customer',
 *   dependencies: [ResidencyDep],
 *   run: async ({ residencyDep }, prev: { org: Organization }) => {
 *     const customer = await residencyDep.createCustomer(prev.org.id)
 *     return { ...prev, customer }
 *   }
 * })
 *
 * // 4. Run behavior tests (cartesian product)
 * behaviorTest({
 *   chain: [
 *     { behavior: createOrgBehavior, invariants: (r) => expect(r.org.id).toBeTruthy() },
 *     { behavior: createCustomerBehavior, invariants: (r) => expect(r.customer.orgId).toBe(r.org.id) }
 *   ]
 * })
 *
 * // 5. Reuse in integration tests
 * it('handles EU customer', async () => {
 *   const result = await runBehavior(createCustomerBehavior, { residencyDep: ResidencyDep.get('eu') }, { org })
 *   expect(result.customer.countryCode).toBe('DE')
 * })
 * ```
 */

// Test runner
export { behaviorTest } from './behaviorTest'

// Cartesian product utilities
export {
  combinationMatches,
  formatCombination,
  generateCombinations,
} from './cartesian'

// Dependency registration
export {
  clearImplementations,
  createGet,
  createGetAll,
  createImplement,
  Dependency,
  getImplementation,
  getImplementations,
  registerImplementation,
} from './Dependency'

// Behavior definition
export { defineBehavior } from './defineBehavior'

// Behavior execution
export { runBehavior } from './runBehavior'

// Types
export type {
  BehaviorDefinition,
  BehaviorTestConfig,
  ChainStep,
  DependencyClass,
  DependencyCombination,
  DependencyFactory,
  ResolvedDependencies,
} from './types'
