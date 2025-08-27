import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createCustomerBookkeeping } from './bookkeeping'
import * as customerMethods from '@/db/tableMethods/customerMethods'
import * as pricingModelMethods from '@/db/tableMethods/pricingModelMethods'
import * as productMethods from '@/db/tableMethods/productMethods'
import * as priceMethods from '@/db/tableMethods/priceMethods'
import * as organizationMethods from '@/db/tableMethods/organizationMethods'
import * as subscriptionModule from '@/subscriptions/createSubscription'
import { IntervalUnit, PriceType, FlowgladEventType, EventNoun } from '@/types'

vi.mock('./stripe', () => ({
  createStripeCustomer: vi.fn().mockResolvedValue({ id: 'stripe_cust_123' }),
}))

vi.mock('@/db/tableMethods/customerMethods')
vi.mock('@/db/tableMethods/pricingModelMethods')
vi.mock('@/db/tableMethods/productMethods')
vi.mock('@/db/tableMethods/priceMethods')
vi.mock('@/db/tableMethods/organizationMethods')
vi.mock('@/subscriptions/createSubscription')

describe('createCustomerBookkeeping', () => {
  const mockTransaction = {} as any
  const mockOrganizationId = 'org_123'
  const mockUserId = 'user_123'
  const mockLivemode = false

  const mockCustomer = {
    id: 'cust_123',
    organizationId: mockOrganizationId,
    livemode: mockLivemode,
    email: 'test@example.com',
    name: 'Test Customer',
    stripeCustomerId: 'stripe_cust_123',
    pricingModelId: null,
  }

  const mockPricingModel = {
    id: 'pm_123',
    organizationId: mockOrganizationId,
    isDefault: true,
    name: 'Default Pricing Model',
  }

  const mockProduct = {
    id: 'prod_123',
    name: 'Default Product',
    pricingModelId: 'pm_123',
    default: true,
    active: true,
  }

  const mockPrice = {
    id: 'price_123',
    productId: 'prod_123',
    isDefault: true,
    active: true,
    intervalUnit: IntervalUnit.Month,
    intervalCount: 1,
    trialPeriodDays: 14,
    type: PriceType.Subscription,
    unitPrice: 1000,
  }

  const mockOrganization = {
    id: mockOrganizationId,
    name: 'Test Organization',
  }

  const mockSubscription = {
    id: 'sub_123',
    customerId: 'cust_123',
    organizationId: mockOrganizationId,
  }

  const mockSubscriptionItems = [
    {
      id: 'si_123',
      subscriptionId: 'sub_123',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    
    vi.spyOn(customerMethods, 'insertCustomer').mockResolvedValue(mockCustomer)
    vi.spyOn(customerMethods, 'updateCustomer').mockResolvedValue(mockCustomer)
    vi.spyOn(pricingModelMethods, 'selectDefaultPricingModel').mockResolvedValue(mockPricingModel)
    vi.spyOn(productMethods, 'selectProducts').mockResolvedValue([mockProduct])
    vi.spyOn(priceMethods, 'selectPrices').mockResolvedValue([mockPrice])
    vi.spyOn(organizationMethods, 'selectOrganizationById').mockResolvedValue(mockOrganization)
    vi.spyOn(subscriptionModule, 'createSubscriptionWorkflow').mockResolvedValue({
      result: {
        subscription: mockSubscription,
        subscriptionItems: mockSubscriptionItems,
        billingPeriod: null,
        billingPeriodItems: null,
        billingRun: null,
        type: 'standard',
      }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should create a customer with a default subscription when no pricing model is specified', async () => {
    const customerInput = {
      email: 'test@example.com',
      name: 'Test Customer',
      organizationId: mockOrganizationId,
      livemode: mockLivemode,
    }

    const result = await createCustomerBookkeeping(
      { customer: customerInput },
      { 
        transaction: mockTransaction, 
        organizationId: mockOrganizationId,
        userId: mockUserId,
        livemode: mockLivemode,
      }
    )

    // Verify customer was created
    expect(customerMethods.insertCustomer).toHaveBeenCalledWith(customerInput, mockTransaction)
    
    // Verify default pricing model was fetched
    expect(pricingModelMethods.selectDefaultPricingModel).toHaveBeenCalledWith(
      {
        organizationId: mockOrganizationId,
        livemode: mockLivemode,
      },
      mockTransaction
    )
    
    // Verify default product was fetched
    expect(productMethods.selectProducts).toHaveBeenCalledWith(
      {
        pricingModelId: mockPricingModel.id,
        default: true,
        active: true,
      },
      mockTransaction
    )
    
    // Verify default price was fetched
    expect(priceMethods.selectPrices).toHaveBeenCalledWith(
      {
        productId: mockProduct.id,
        isDefault: true,
        active: true,
      },
      mockTransaction
    )
    
    // Verify subscription was created
    expect(subscriptionModule.createSubscriptionWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: expect.objectContaining({
          id: mockCustomer.id,
          stripeCustomerId: mockCustomer.stripeCustomerId,
        }),
        product: mockProduct,
        price: mockPrice,
        quantity: 1,
        autoStart: true,
      }),
      mockTransaction
    )
    
    // Verify result contains customer and subscription in TransactionOutput format
    expect(result.result).toEqual({
      customer: mockCustomer,
      subscription: mockSubscription,
      subscriptionItems: mockSubscriptionItems,
    })
    
    // Verify events were created
    expect(result.eventsToLog).toBeDefined()
    expect(result.eventsToLog?.length).toBeGreaterThan(0)
    expect(result.eventsToLog?.some(e => e.type === FlowgladEventType.CustomerCreated)).toBe(true)
  })

  it('should create a customer with subscription from specified pricing model', async () => {
    const customerWithPricingModel = {
      ...mockCustomer,
      pricingModelId: 'pm_456',
    }
    
    vi.spyOn(customerMethods, 'insertCustomer').mockResolvedValue(customerWithPricingModel)

    const customerInput = {
      email: 'test@example.com',
      name: 'Test Customer',
      organizationId: mockOrganizationId,
      livemode: mockLivemode,
      pricingModelId: 'pm_456',
    }

    const result = await createCustomerBookkeeping(
      { customer: customerInput },
      { 
        transaction: mockTransaction, 
        organizationId: mockOrganizationId,
        userId: mockUserId,
        livemode: mockLivemode,
      }
    )

    // Verify default pricing model was NOT fetched (since customer has one specified)
    expect(pricingModelMethods.selectDefaultPricingModel).not.toHaveBeenCalled()
    
    // Verify products were fetched for the specified pricing model
    expect(productMethods.selectProducts).toHaveBeenCalledWith(
      {
        pricingModelId: 'pm_456',
        default: true,
        active: true,
      },
      mockTransaction
    )
  })

  it('should create customer without subscription if no default product exists', async () => {
    vi.spyOn(productMethods, 'selectProducts').mockResolvedValue([])

    const customerInput = {
      email: 'test@example.com',
      name: 'Test Customer',
      organizationId: mockOrganizationId,
      livemode: mockLivemode,
    }

    const result = await createCustomerBookkeeping(
      { customer: customerInput },
      { 
        transaction: mockTransaction, 
        organizationId: mockOrganizationId,
        userId: mockUserId,
        livemode: mockLivemode,
      }
    )

    // Verify subscription was NOT created
    expect(subscriptionModule.createSubscriptionWorkflow).not.toHaveBeenCalled()
    
    // Verify result contains only customer in TransactionOutput format
    expect(result.result).toEqual({
      customer: mockCustomer,
    })
    
    // Verify customer created event exists
    expect(result.eventsToLog).toBeDefined()
    expect(result.eventsToLog?.some(e => e.type === FlowgladEventType.CustomerCreated)).toBe(true)
  })

  it('should create customer without subscription if no default price exists', async () => {
    vi.spyOn(priceMethods, 'selectPrices').mockResolvedValue([])

    const customerInput = {
      email: 'test@example.com',
      name: 'Test Customer',
      organizationId: mockOrganizationId,
      livemode: mockLivemode,
    }

    const result = await createCustomerBookkeeping(
      { customer: customerInput },
      { 
        transaction: mockTransaction, 
        organizationId: mockOrganizationId,
        userId: mockUserId,
        livemode: mockLivemode,
      }
    )

    // Verify subscription was NOT created
    expect(subscriptionModule.createSubscriptionWorkflow).not.toHaveBeenCalled()
    
    // Verify result contains only customer in TransactionOutput format
    expect(result.result).toEqual({
      customer: mockCustomer,
    })
    
    // Verify customer created event exists
    expect(result.eventsToLog).toBeDefined()
    expect(result.eventsToLog?.some(e => e.type === FlowgladEventType.CustomerCreated)).toBe(true)
  })

  it('should handle subscription creation failure gracefully', async () => {
    vi.spyOn(subscriptionModule, 'createSubscriptionWorkflow').mockRejectedValue(
      new Error('Subscription creation failed')
    )
    
    // Spy on console.error
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const customerInput = {
      email: 'test@example.com',
      name: 'Test Customer',
      organizationId: mockOrganizationId,
      livemode: mockLivemode,
    }

    const result = await createCustomerBookkeeping(
      { customer: customerInput },
      { 
        transaction: mockTransaction, 
        organizationId: mockOrganizationId,
        userId: mockUserId,
        livemode: mockLivemode,
      }
    )

    // Verify error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to create default subscription for customer:',
      expect.any(Error)
    )
    
    // Verify customer was still created successfully in TransactionOutput format
    expect(result.result).toEqual({
      customer: mockCustomer,
    })
    
    // Verify customer created event exists even when subscription fails
    expect(result.eventsToLog).toBeDefined()
    expect(result.eventsToLog?.some(e => e.type === FlowgladEventType.CustomerCreated)).toBe(true)
    
    consoleErrorSpy.mockRestore()
  })
})