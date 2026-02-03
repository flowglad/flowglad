/**
 * Unit tests for customer TRPC router (Patch 5).
 *
 * These tests verify:
 * 1. customerAppRouter exports the correct procedures
 * 2. customerBillingPortal sub-router is included
 */
import { describe, expect, it } from 'bun:test'
import {
  type CustomerAppRouter,
  customerAppRouter,
} from './customerRouter'

describe('customerAppRouter', () => {
  it('exports customerAppRouter as an object', () => {
    expect(typeof customerAppRouter).toBe('object')
  })

  it('includes customerBillingPortal sub-router', () => {
    // The router should have a customerBillingPortal property
    expect(customerAppRouter).toHaveProperty('customerBillingPortal')
  })

  it('customerBillingPortal contains expected procedures', () => {
    // Verify the customerBillingPortal router contains the expected procedure names
    const customerBillingPortal =
      customerAppRouter.customerBillingPortal
    expect(customerBillingPortal).toHaveProperty('getBilling')
    expect(customerBillingPortal).toHaveProperty('cancelSubscription')
    expect(customerBillingPortal).toHaveProperty(
      'uncancelSubscription'
    )
    expect(customerBillingPortal).toHaveProperty('requestMagicLink')
    expect(customerBillingPortal).toHaveProperty(
      'createAddPaymentMethodSession'
    )
    expect(customerBillingPortal).toHaveProperty(
      'setDefaultPaymentMethod'
    )
    expect(customerBillingPortal).toHaveProperty(
      'createCheckoutSessionWithPrice'
    )
    expect(customerBillingPortal).toHaveProperty(
      'createAddPaymentMethodCheckoutSession'
    )
    expect(customerBillingPortal).toHaveProperty(
      'getCustomersForUserAndOrganization'
    )
    expect(customerBillingPortal).toHaveProperty('sendOTPToCustomer')
  })
})

describe('CustomerAppRouter type', () => {
  it('CustomerAppRouter type is exported', () => {
    // Type-level test - if the type doesn't exist, this won't compile
    const assertType = <T>(_value: T) => {}
    assertType<CustomerAppRouter>(customerAppRouter)
    expect(true).toBe(true) // If we get here, the type exists
  })
})
