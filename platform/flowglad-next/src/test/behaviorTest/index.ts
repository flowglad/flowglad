/**
 * Behavioral Testing Framework
 *
 * A framework for testing behaviors across the cartesian product of
 * dependency implementations with universal invariants.
 *
 * @example
 * ```typescript
 * // 1. Define a dependency interface and abstract class
 * interface Residency {
 *   createCustomer(orgId: string): Promise<Customer>
 *   countryCode: string
 * }
 *
 * abstract class ResidencyDep extends Dependency<Residency>() {
 *   abstract createCustomer(orgId: string): Promise<Customer>
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

// Types
export type {
  DependencyFactory,
  DependencyClass,
  DependencyCombination,
  ResolvedDependencies,
  BehaviorDefinition,
  ChainStep,
  BehaviorTestConfig,
} from './types'

// Dependency registration
export {
  Dependency,
  registerImplementation,
  getImplementation,
  getImplementations,
  clearImplementations,
  createImplement,
  createGet,
  createGetAll,
} from './Dependency'

// Cartesian product utilities
export {
  generateCombinations,
  formatCombination,
  combinationMatches,
} from './cartesian'

// Behavior definition
export { defineBehavior } from './defineBehavior'

// Behavior execution
export { runBehavior } from './runBehavior'

// Test runner
export { behaviorTest } from './behaviorTest'
