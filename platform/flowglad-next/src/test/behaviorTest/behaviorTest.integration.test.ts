/**
 * Behavioral Testing Framework - Sample Integration Test
 *
 * This test demonstrates the framework by testing customer creation
 * across different organization and customer type configurations.
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupOrg,
  teardownOrg,
} from '@/../seedDatabase'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import {
  behaviorTest,
  Dependency,
  defineBehavior,
  runBehavior,
} from './index'

// ============================================================================
// Dependency Definitions
// ============================================================================

/**
 * OrgTypeDep - Defines how organizations are set up.
 * Different implementations create orgs with different configurations.
 */
type OrgSetupResult = {
  organization: Organization.Record
  pricingModel: PricingModel.Record
  product: Product.Record
  price: Price.Record
}

interface OrgType {
  setup(): Promise<OrgSetupResult>
}

abstract class OrgTypeDep extends Dependency<OrgType>() {
  abstract setup(): Promise<OrgSetupResult>
}

/**
 * CustomerTypeDep - Defines how customers are created.
 * Different implementations create customers with different profiles.
 */
interface CustomerType {
  createCustomer(organizationId: string): Promise<Customer.Record>
  customerName: string
}

abstract class CustomerTypeDep extends Dependency<CustomerType>() {
  abstract createCustomer(
    organizationId: string
  ): Promise<Customer.Record>
  abstract customerName: string
}

// ============================================================================
// Dependency Implementations
// ============================================================================

// Register OrgTypeDep implementations
OrgTypeDep.implement('standard', {
  setup: async () => {
    const result = await setupOrg()
    return {
      organization: result.organization,
      pricingModel: result.pricingModel,
      product: result.product,
      price: result.price,
    }
  },
})

OrgTypeDep.implement('enterprise', {
  setup: async () => {
    // Enterprise orgs might have different fee percentage
    const result = await setupOrg({
      feePercentage: '0.5',
    })
    return {
      organization: result.organization,
      pricingModel: result.pricingModel,
      product: result.product,
      price: result.price,
    }
  },
})

// Register CustomerTypeDep implementations
CustomerTypeDep.implement('individual', {
  customerName: 'Individual Customer',
  createCustomer: async (organizationId: string) => {
    return setupCustomer({
      organizationId,
      name: 'Individual Customer',
      email: `individual-${Date.now()}@test.com`,
    })
  },
})

CustomerTypeDep.implement('business', {
  customerName: 'Business Customer',
  createCustomer: async (organizationId: string) => {
    return setupCustomer({
      organizationId,
      name: 'Business Customer',
      email: `business-${Date.now()}@test.com`,
    })
  },
})

// ============================================================================
// Behavior Definitions
// ============================================================================

/**
 * Behavior: Create an organization
 * Sets up an org using the OrgTypeDep implementation.
 */
const createOrgBehavior = defineBehavior({
  name: 'create org',
  dependencies: [OrgTypeDep],
  run: async ({ orgTypeDep }, _prev: undefined) => {
    const result = await orgTypeDep.setup()
    return {
      organization: result.organization,
      pricingModel: result.pricingModel,
      product: result.product,
      price: result.price,
    }
  },
})

/**
 * Behavior: Create a customer
 * Creates a customer using the CustomerTypeDep implementation.
 * Requires previous state with an organization.
 */
const createCustomerBehavior = defineBehavior({
  name: 'create customer',
  dependencies: [CustomerTypeDep],
  run: async (
    { customerTypeDep },
    prev: { organization: Organization.Record }
  ) => {
    const customer = await customerTypeDep.createCustomer(
      prev.organization.id
    )
    return {
      ...prev,
      customer,
    }
  },
})

// ============================================================================
// Behavior Test - Runs against all combinations
// ============================================================================

/**
 * Result type for the behavior chain - used for typed teardown
 */
interface BehaviorChainResult {
  organization: Organization.Record
  pricingModel: PricingModel.Record
  product: Product.Record
  price: Price.Record
  customer: Customer.Record
}

/**
 * This test runs through the org creation and customer creation behaviors
 * for ALL combinations of:
 * - OrgTypeDep: { standard, enterprise }
 * - CustomerTypeDep: { individual, business }
 *
 * Total: 4 test cases
 */
behaviorTest({
  chain: [
    {
      behavior: createOrgBehavior,
      invariants: (result) => {
        // Universal invariants - must hold for ALL org types
        expect(result.organization.id).toMatch(/^org_/)
        expect(result.organization.name).toBeTruthy()
        expect(result.pricingModel.id).toMatch(/^pm_/)
        expect(result.product.id).toMatch(/^prod_/)
        expect(result.price.id).toMatch(/^price_/)
        expect(result.price.productId).toBe(result.product.id)
      },
    },
    {
      behavior: createCustomerBehavior,
      invariants: (result) => {
        // Universal invariants - must hold for ALL customer types
        expect(result.customer.id).toMatch(/^cust_/)
        expect(result.customer.organizationId).toBe(
          result.organization.id
        )
        expect(result.customer.email).toBeTruthy()
        expect(result.customer.name).toBeTruthy()
      },
    },
  ],
  testOptions: { timeout: 30000 },
  // Cleanup: teardown is called after all tests with all final results
  teardown: async (results) => {
    for (const result of results as BehaviorChainResult[]) {
      try {
        await teardownOrg({ organizationId: result.organization.id })
      } catch {
        // Ignore cleanup errors
      }
    }
  },
})

// ============================================================================
// Integration Test - Reusing behaviors with specific implementations
// ============================================================================

describe('Integration test reusing behaviors', () => {
  let testOrgId: string | null = null

  afterEach(async () => {
    if (testOrgId) {
      try {
        await teardownOrg({ organizationId: testOrgId })
      } catch {
        // Ignore cleanup errors
      }
      testOrgId = null
    }
  })

  it('creates an enterprise org with a business customer', async () => {
    // Get specific implementations
    const enterpriseOrg = OrgTypeDep.get('enterprise')
    const businessCustomer = CustomerTypeDep.get('business')

    // Run the org behavior
    const orgResult = await runBehavior(
      createOrgBehavior,
      { orgTypeDep: enterpriseOrg },
      undefined
    )
    testOrgId = orgResult.organization.id

    // Run the customer behavior with org result as previous state
    const customerResult = await runBehavior(
      createCustomerBehavior,
      { customerTypeDep: businessCustomer },
      orgResult
    )

    // Make specific assertions for this combination
    expect(customerResult.organization.feePercentage).toBe('0.5')
    expect(customerResult.customer.name).toBe('Business Customer')
  })
})
