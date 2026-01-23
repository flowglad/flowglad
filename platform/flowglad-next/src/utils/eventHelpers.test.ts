import { describe, expect, test } from 'bun:test'
import {
  constructCustomerCreatedEventHash,
  constructPaymentFailedEventHash,
  constructPaymentSucceededEventHash,
  constructPurchaseCompletedEventHash,
  constructSubscriptionCreatedEventHash,
} from './eventHelpers'

describe('constructSubscriptionCreatedEventHash', () => {
  test('generates same hash for subscriptions with same id', () => {
    const sub1 = {
      id: 'sub_123',
      livemode: true,
    } as const

    const sub2 = {
      id: 'sub_123',
      livemode: true,
    } as const

    const hash1 = constructSubscriptionCreatedEventHash(sub1)
    const hash2 = constructSubscriptionCreatedEventHash(sub2)

    expect(hash1).toBe(hash2)
  })

  test('generates different hashes for different subscription ids', () => {
    const sub1 = {
      id: 'sub_123',
      livemode: true,
    } as const

    const sub2 = {
      id: 'sub_456',
      livemode: true,
    } as const

    const hash1 = constructSubscriptionCreatedEventHash(sub1)
    const hash2 = constructSubscriptionCreatedEventHash(sub2)

    expect(hash1).not.toBe(hash2)
  })
})

describe('constructPaymentSucceededEventHash', () => {
  test('generates same hash for payments with same id', () => {
    const payment1 = {
      id: 'pay_123',
      amount: 1000,
      customerId: 'cust_123',
    } as const

    const payment2 = {
      id: 'pay_123',
      amount: 2000, // Different amount shouldn't matter
      customerId: 'cust_456', // Different customer shouldn't matter
    } as const

    const hash1 = constructPaymentSucceededEventHash(payment1)
    const hash2 = constructPaymentSucceededEventHash(payment2)

    expect(hash1).toBe(hash2)
  })

  test('generates different hashes for different payment ids', () => {
    const payment1 = {
      id: 'pay_123',
    } as const

    const payment2 = {
      id: 'pay_456',
    } as const

    const hash1 = constructPaymentSucceededEventHash(payment1)
    const hash2 = constructPaymentSucceededEventHash(payment2)

    expect(hash1).not.toBe(hash2)
  })

  test('hash is stable across multiple calls', () => {
    const payment = {
      id: 'pay_stable_test',
    } as const

    const hash1 = constructPaymentSucceededEventHash(payment)
    const hash2 = constructPaymentSucceededEventHash(payment)
    const hash3 = constructPaymentSucceededEventHash(payment)

    expect(hash1).toBe(hash2)
    expect(hash2).toBe(hash3)
  })
})

describe('constructPaymentFailedEventHash', () => {
  test('generates same hash for payments with same id', () => {
    const payment1 = {
      id: 'pay_failed_123',
    } as const

    const payment2 = {
      id: 'pay_failed_123',
    } as const

    const hash1 = constructPaymentFailedEventHash(payment1)
    const hash2 = constructPaymentFailedEventHash(payment2)

    expect(hash1).toBe(hash2)
  })

  test('generates different hashes for different payment ids', () => {
    const payment1 = {
      id: 'pay_failed_123',
    } as const

    const payment2 = {
      id: 'pay_failed_456',
    } as const

    const hash1 = constructPaymentFailedEventHash(payment1)
    const hash2 = constructPaymentFailedEventHash(payment2)

    expect(hash1).not.toBe(hash2)
  })

  test('PaymentFailed hash differs from PaymentSucceeded hash for same payment', () => {
    const payment = {
      id: 'pay_same_id',
    } as const

    const successHash = constructPaymentSucceededEventHash(payment)
    const failedHash = constructPaymentFailedEventHash(payment)

    expect(successHash).not.toBe(failedHash)
  })
})

describe('constructPurchaseCompletedEventHash', () => {
  test('generates same hash for purchases with same id', () => {
    const purchase1 = {
      id: 'pur_123',
      priceId: 'price_123',
      customerId: 'cust_123',
    } as const

    const purchase2 = {
      id: 'pur_123',
      priceId: 'price_456', // Different price shouldn't matter
      customerId: 'cust_456', // Different customer shouldn't matter
    } as const

    const hash1 = constructPurchaseCompletedEventHash(purchase1)
    const hash2 = constructPurchaseCompletedEventHash(purchase2)

    expect(hash1).toBe(hash2)
  })

  test('generates different hashes for different purchase ids', () => {
    const purchase1 = {
      id: 'pur_123',
    } as const

    const purchase2 = {
      id: 'pur_456',
    } as const

    const hash1 = constructPurchaseCompletedEventHash(purchase1)
    const hash2 = constructPurchaseCompletedEventHash(purchase2)

    expect(hash1).not.toBe(hash2)
  })

  test('hash is stable across multiple calls', () => {
    const purchase = {
      id: 'pur_stable_test',
    } as const

    const hash1 = constructPurchaseCompletedEventHash(purchase)
    const hash2 = constructPurchaseCompletedEventHash(purchase)
    const hash3 = constructPurchaseCompletedEventHash(purchase)

    expect(hash1).toBe(hash2)
    expect(hash2).toBe(hash3)
  })
})

describe('constructCustomerCreatedEventHash', () => {
  test('generates same hash for customers with same id', () => {
    const customer1 = {
      id: 'cust_123',
      email: 'test1@example.com',
    } as const

    const customer2 = {
      id: 'cust_123',
      email: 'test2@example.com', // Different email shouldn't matter
    } as const

    const hash1 = constructCustomerCreatedEventHash(customer1)
    const hash2 = constructCustomerCreatedEventHash(customer2)

    expect(hash1).toBe(hash2)
  })

  test('generates different hashes for different customer ids', () => {
    const customer1 = {
      id: 'cust_123',
    } as const

    const customer2 = {
      id: 'cust_456',
    } as const

    const hash1 = constructCustomerCreatedEventHash(customer1)
    const hash2 = constructCustomerCreatedEventHash(customer2)

    expect(hash1).not.toBe(hash2)
  })
})

describe('Event hash uniqueness across types', () => {
  test('different event types with same ID generate different hashes', () => {
    const id = 'shared_id_123'

    // Using the same ID for different entity types
    const subscription = { id }
    const payment = { id }
    const purchase = { id }
    const customer = { id }

    const subscriptionHash =
      constructSubscriptionCreatedEventHash(subscription)
    const paymentSuccessHash =
      constructPaymentSucceededEventHash(payment)
    const paymentFailHash = constructPaymentFailedEventHash(payment)
    const purchaseHash = constructPurchaseCompletedEventHash(purchase)
    const customerHash = constructCustomerCreatedEventHash(customer)

    // All hashes should be unique even with same ID
    const hashes = [
      subscriptionHash,
      paymentSuccessHash,
      paymentFailHash,
      purchaseHash,
      customerHash,
    ]

    // Check that all hashes are unique
    const uniqueHashes = new Set(hashes)
    expect(uniqueHashes.size).toBe(hashes.length)
  })
})
