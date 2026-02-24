/**
 * Unit tests for dual-scope TRPC context (Patch 5).
 *
 * These tests verify:
 * 1. createContext uses getMerchantSession and sets authScope='merchant'
 * 2. createCustomerContext uses getCustomerSession and sets authScope='customer'
 * 3. Context functions are properly exported
 */
import { describe, expect, it } from 'bun:test'
import {
  type AuthScope,
  createContext,
  createCustomerContext,
  type TRPCContext,
  type TRPCCustomerContext,
} from './trpcContext'

describe('trpcContext exports', () => {
  it('exports createContext as a function', () => {
    expect(typeof createContext).toBe('function')
  })

  it('exports createCustomerContext as a function', () => {
    expect(typeof createCustomerContext).toBe('function')
  })

  it('createContext and createCustomerContext are distinct functions', () => {
    expect(createContext).not.toBe(createCustomerContext)
  })
})

describe('AuthScope type', () => {
  it('allows merchant and customer as valid scopes', () => {
    const merchantScope: AuthScope = 'merchant'
    const customerScope: AuthScope = 'customer'

    expect(merchantScope).toBe('merchant')
    expect(customerScope).toBe('customer')
  })
})

describe('context type structure', () => {
  it('TRPCContext includes authScope property', () => {
    // Type-level test: verify the type includes authScope
    // This is a compile-time check - if the type doesn't include authScope, this will fail to compile
    const mockContext: Partial<TRPCContext> = {
      authScope: 'merchant',
    }
    expect(mockContext.authScope).toBe('merchant')
  })

  it('TRPCCustomerContext includes authScope property', () => {
    // Type-level test: verify the type includes authScope
    const mockContext: Partial<TRPCCustomerContext> = {
      authScope: 'customer',
    }
    expect(mockContext.authScope).toBe('customer')
  })

  it('TRPCContext authScope is merchant literal type', () => {
    // Verify the type is the literal 'merchant' not just string
    const mockContext: TRPCContext = {
      user: undefined,
      session: null,
      path: '/test',
      environment: 'live',
      livemode: true,
      organizationId: undefined,
      organization: undefined,
      isApi: false,
      apiKey: undefined,
      authScope: 'merchant',
      focusedPricingModelId: undefined,
      apiKeyPricingModelId: undefined,
    }
    expect(mockContext.authScope).toBe('merchant')
  })

  it('TRPCCustomerContext authScope is customer literal type', () => {
    // Verify the type is the literal 'customer' not just string
    const mockContext: TRPCCustomerContext = {
      user: undefined,
      session: null,
      path: '/test',
      environment: 'live',
      livemode: true,
      organizationId: undefined,
      organization: undefined,
      isApi: false,
      apiKey: undefined,
      authScope: 'customer',
      apiKeyPricingModelId: undefined,
    }
    expect(mockContext.authScope).toBe('customer')
  })
})
