import { beforeEach, describe, expect, it } from 'bun:test'
import {
  IntervalUnit,
  PriceType,
  SubscriptionStatus,
} from '@db-core/enums'
import { Customer } from '@db-core/schema/customers'
import { Organization } from '@db-core/schema/organizations'
import { PaymentMethod } from '@db-core/schema/paymentMethods'
import {
  Subscription,
  subscriptions,
} from '@db-core/schema/subscriptions'
import { Result } from 'better-result'
import { inArray } from 'drizzle-orm'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupSubscription,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import { SubscriptionTerminalStateError } from '@/errors'
import { core } from '@/utils/core'
import {
  assertSubscriptionNotTerminal,
  bulkInsertOrDoNothingSubscriptionsByExternalId,
  derivePricingModelIdFromSubscription,
  insertSubscription,
  isSubscriptionInTerminalState,
  type SubscriptionTableFilters,
  selectDistinctSubscriptionProductNames,
  selectSubscriptions,
  selectSubscriptionsTableRowData,
  TERMINAL_SUBSCRIPTION_STATES,
} from './subscriptionMethods'

describe('selectDistinctSubscriptionProductNames', () => {
  let organization: Organization.Record
  let organization2: Organization.Record
  let pricingModel: { id: string }
  let pricingModel2: { id: string }
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    customer = await setupCustomer({
      organizationId: organization.id,
    })

    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    // Setup second organization for isolation tests
    const orgData2 = await setupOrg()
    organization2 = orgData2.organization
    pricingModel2 = orgData2.pricingModel
  })

  it('should return empty array when organization has no subscriptions', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await selectDistinctSubscriptionProductNames(
          organization.id,
          transaction
        )
        expect(result).toEqual([])
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('should return deduplicated, case-insensitively ordered products for the given organization', async () => {
    // Create multiple products with different names (including case variations)
    const product1 = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'zebra',
    })

    const product2 = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Apple',
    })

    const product3 = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Banana',
    })

    // Create multiple prices for the same product to test deduplication
    const price1 = await setupPrice({
      productId: product1.id,
      name: 'Price 1',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
    })

    const price2 = await setupPrice({
      productId: product2.id,
      name: 'Price 2',
      type: PriceType.Subscription,
      unitPrice: 2000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
    })

    const price3 = await setupPrice({
      productId: product3.id,
      name: 'Price 3',
      type: PriceType.Subscription,
      unitPrice: 3000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
    })

    // Create another price for product2 to test deduplication
    const price4 = await setupPrice({
      productId: product2.id,
      name: 'Price 4',
      type: PriceType.Subscription,
      unitPrice: 4000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
    })

    // Create subscriptions - some with same product to test deduplication
    const subscription1 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price1.id,
    })
    // Verify pricingModelId is derived from price's product
    expect(subscription1.pricingModelId).toBe(product1.pricingModelId)
    expect(subscription1.pricingModelId).toBe(pricingModel.id)

    const subscription2 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price2.id,
    })
    expect(subscription2.pricingModelId).toBe(product2.pricingModelId)
    expect(subscription2.pricingModelId).toBe(pricingModel.id)

    const subscription3 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price3.id,
    })
    expect(subscription3.pricingModelId).toBe(product3.pricingModelId)
    expect(subscription3.pricingModelId).toBe(pricingModel.id)

    // Add another subscription with product2 to verify deduplication
    const subscription4 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price4.id,
    })
    expect(subscription4.pricingModelId).toBe(product2.pricingModelId)
    expect(subscription4.pricingModelId)
      .toBe(pricingModel.id)(
        await adminTransactionWithResult(async ({ transaction }) => {
          const result = await selectDistinctSubscriptionProductNames(
            organization.id,
            transaction
          )
          // Should be deduplicated (Apple appears only once despite 2 subscriptions)
          // Should be case-insensitively sorted (Apple, Banana, zebra)
          expect(result).toEqual(['Apple', 'Banana', 'zebra'])
          return Result.ok(undefined)
        })
      )
      .unwrap()
  })

  it('should only return products for the given organization', async () => {
    const product1 = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Product Org1',
    })

    const product2 = await setupProduct({
      organizationId: organization2.id,
      pricingModelId: pricingModel2.id,
      name: 'Product Org2',
    })

    const price1 = await setupPrice({
      productId: product1.id,
      name: 'Price 1',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
    })

    const price2 = await setupPrice({
      productId: product2.id,
      name: 'Price 2',
      type: PriceType.Subscription,
      unitPrice: 2000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
    })

    const customer2 = await setupCustomer({
      organizationId: organization2.id,
    })

    const paymentMethod2 = await setupPaymentMethod({
      organizationId: organization2.id,
      customerId: customer2.id,
    })

    const subscriptionOrg1 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price1.id,
    })
    expect(subscriptionOrg1.pricingModelId).toBe(
      product1.pricingModelId
    )
    expect(subscriptionOrg1.pricingModelId).toBe(pricingModel.id)

    const subscriptionOrg2 = await setupSubscription({
      organizationId: organization2.id,
      customerId: customer2.id,
      paymentMethodId: paymentMethod2.id,
      priceId: price2.id,
    })
    expect(subscriptionOrg2.pricingModelId).toBe(
      product2.pricingModelId
    )
    expect(subscriptionOrg2.pricingModelId)
      .toBe(pricingModel2.id)(
        await adminTransactionWithResult(async ({ transaction }) => {
          const result1 =
            await selectDistinctSubscriptionProductNames(
              organization.id,
              transaction
            )
          expect(result1).toEqual(['Product Org1'])

          const result2 =
            await selectDistinctSubscriptionProductNames(
              organization2.id,
              transaction
            )
          expect(result2).toEqual(['Product Org2'])
          return Result.ok(undefined)
        })
      )
      .unwrap()
  })
})

describe('selectSubscriptionsTableRowData', () => {
  let organization: Organization.Record
  let organization2: Organization.Record
  let pricingModel: { id: string }
  let pricingModel2: { id: string }
  let customer1: Customer.Record
  let customer2: Customer.Record
  let customer3: Customer.Record
  let customerOtherOrg: Customer.Record
  let paymentMethod1: PaymentMethod.Record
  let paymentMethod2: PaymentMethod.Record
  let paymentMethod3: PaymentMethod.Record
  let paymentMethodOtherOrg: PaymentMethod.Record
  let product1: { id: string; name: string }
  let product2: { id: string; name: string }
  let productOtherOrg: { id: string; name: string }
  let price1: { id: string }
  let price2: { id: string }
  let priceOtherOrg: { id: string }
  let subscription1: Subscription.Record
  let subscription2: Subscription.Record
  let subscription3: Subscription.Record
  let subscriptionOtherOrg: Subscription.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    // Setup customers with different names for search testing
    customer1 = await setupCustomer({
      organizationId: organization.id,
      name: 'Alice Smith',
      email: 'alice@example.com',
    })

    customer2 = await setupCustomer({
      organizationId: organization.id,
      name: 'Bob Jones',
      email: 'bob@example.com',
    })

    customer3 = await setupCustomer({
      organizationId: organization.id,
      name: 'Charlie Brown',
      email: 'charlie@example.com',
    })

    paymentMethod1 = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer1.id,
    })

    paymentMethod2 = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer2.id,
    })

    paymentMethod3 = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer3.id,
    })

    // Setup products for filter testing
    product1 = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Premium Plan',
    })

    product2 = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Basic Plan',
    })

    price1 = await setupPrice({
      productId: product1.id,
      name: 'Premium Price',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
    })

    price2 = await setupPrice({
      productId: product2.id,
      name: 'Basic Price',
      type: PriceType.Subscription,
      unitPrice: 500,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
    })

    // Setup subscriptions
    subscription1 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer1.id,
      paymentMethodId: paymentMethod1.id,
      priceId: price1.id,
      status: SubscriptionStatus.Active,
    })

    subscription2 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer2.id,
      paymentMethodId: paymentMethod2.id,
      priceId: price1.id, // Same product as subscription1
      status: SubscriptionStatus.Active,
    })

    subscription3 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer3.id,
      paymentMethodId: paymentMethod3.id,
      priceId: price2.id, // Different product
      status: SubscriptionStatus.Active,
    })

    // Setup second organization for isolation tests
    const orgData2 = await setupOrg()
    organization2 = orgData2.organization
    pricingModel2 = orgData2.pricingModel

    customerOtherOrg = await setupCustomer({
      organizationId: organization2.id,
      name: 'Alice Smith', // Same name as customer1 to test isolation
      email: 'alice-other@example.com',
    })

    paymentMethodOtherOrg = await setupPaymentMethod({
      organizationId: organization2.id,
      customerId: customerOtherOrg.id,
    })

    productOtherOrg = await setupProduct({
      organizationId: organization2.id,
      pricingModelId: pricingModel2.id,
      name: 'Premium Plan', // Same name as product1 to test isolation
    })

    priceOtherOrg = await setupPrice({
      productId: productOtherOrg.id,
      name: 'Premium Price Other',
      type: PriceType.Subscription,
      unitPrice: 2000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
    })

    subscriptionOtherOrg = await setupSubscription({
      organizationId: organization2.id,
      customerId: customerOtherOrg.id,
      paymentMethodId: paymentMethodOtherOrg.id,
      priceId: priceOtherOrg.id,
      status: SubscriptionStatus.Active,
    })
  })

  describe('search functionality', () => {
    it('should search by subscription ID or customer name (case-insensitive, trims whitespace)', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          // Test subscription ID search
          const resultById = await selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: subscription1.id,
              filters: { organizationId: organization.id },
            },
            transaction,
          })
          expect(resultById.items.length).toBe(1)
          expect(resultById.items[0].subscription.id).toBe(
            subscription1.id
          )
          expect(resultById.total).toBe(1)

          // Test partial customer name search (case-insensitive)
          const resultByName = await selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'alice',
              filters: { organizationId: organization.id },
            },
            transaction,
          })
          expect(resultByName.items.length).toBe(1)
          expect(resultByName.items[0].subscription.id).toBe(
            subscription1.id
          )
          expect(resultByName.items[0].customer.name).toBe(
            'Alice Smith'
          )

          // Test case-insensitive search
          const resultCaseInsensitive =
            await selectSubscriptionsTableRowData({
              input: {
                pageSize: 10,
                searchQuery: 'CHARLIE',
                filters: { organizationId: organization.id },
              },
              transaction,
            })
          expect(resultCaseInsensitive.items.length).toBe(1)
          expect(resultCaseInsensitive.items[0].customer.name).toBe(
            'Charlie Brown'
          )

          // Test whitespace trimming
          const resultTrimmed = await selectSubscriptionsTableRowData(
            {
              input: {
                pageSize: 10,
                searchQuery: '  alice  ',
                filters: { organizationId: organization.id },
              },
              transaction,
            }
          )
          expect(resultTrimmed.items.length).toBe(1)
          expect(resultTrimmed.items[0].subscription.id).toBe(
            subscription1.id
          )
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should ignore empty or whitespace-only search queries', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const resultEmpty = await selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: '',
              filters: { organizationId: organization.id },
            },
            transaction,
          })

          const resultWhitespace =
            await selectSubscriptionsTableRowData({
              input: {
                pageSize: 10,
                searchQuery: '   ',
                filters: { organizationId: organization.id },
              },
              transaction,
            })

          const resultUndefined =
            await selectSubscriptionsTableRowData({
              input: {
                pageSize: 10,
                searchQuery: undefined,
                filters: { organizationId: organization.id },
              },
              transaction,
            })

          // All should return all 3 subscriptions
          expect(resultEmpty.items.length).toBe(3)
          expect(resultEmpty.total).toBe(3)
          expect(resultWhitespace.items.length).toBe(3)
          expect(resultWhitespace.total).toBe(3)
          expect(resultUndefined.items.length).toBe(3)
          expect(resultUndefined.total).toBe(3)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should only return subscriptions for the specified organization', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          // Search for "Alice" - should only return subscription1, not subscriptionOtherOrg
          const result = await selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'alice',
              filters: { organizationId: organization.id },
            },
            transaction,
          })

          expect(result.items.length).toBe(1)
          expect(result.items[0].subscription.id).toBe(
            subscription1.id
          )
          expect(result.items[0].subscription.organizationId).toBe(
            organization.id
          )
          expect(result.total).toBe(1)
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  describe('productName filter functionality', () => {
    it('should filter by product name (trims whitespace)', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          // Test Premium Plan filter
          const resultPremium = await selectSubscriptionsTableRowData(
            {
              input: {
                pageSize: 10,
                filters: {
                  organizationId: organization.id,
                  productName: 'Premium Plan',
                } as SubscriptionTableFilters,
              },
              transaction,
            }
          )

          expect(resultPremium.items.length).toBe(2) // subscription1 and subscription2
          const subscriptionIds = resultPremium.items.map(
            (item) => item.subscription.id
          )
          expect(subscriptionIds).toContain(subscription1.id)
          expect(subscriptionIds).toContain(subscription2.id)
          expect(subscriptionIds).not.toContain(subscription3.id)
          expect(resultPremium.total).toBe(2)

          // Test Basic Plan filter
          const resultBasic = await selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: organization.id,
                productName: 'Basic Plan',
              } as SubscriptionTableFilters,
            },
            transaction,
          })

          expect(resultBasic.items.length).toBe(1)
          expect(resultBasic.items[0].subscription.id).toBe(
            subscription3.id
          )
          // Product may be null for usage prices, but this test uses subscription prices
          expect(resultBasic.items[0].product!.name).toBe(
            'Basic Plan'
          )

          // Test whitespace trimming
          const resultTrimmed = await selectSubscriptionsTableRowData(
            {
              input: {
                pageSize: 10,
                filters: {
                  organizationId: organization.id,
                  productName: '  Premium Plan  ',
                } as SubscriptionTableFilters,
              },
              transaction,
            }
          )

          expect(resultTrimmed.items.length).toBe(2)
          expect(resultTrimmed.total).toBe(2)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should ignore empty or whitespace-only product name filters', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const resultEmpty = await selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: organization.id,
                productName: '',
              } as SubscriptionTableFilters,
            },
            transaction,
          })

          const resultWhitespace =
            await selectSubscriptionsTableRowData({
              input: {
                pageSize: 10,
                filters: {
                  organizationId: organization.id,
                  productName: '   ',
                } as SubscriptionTableFilters,
              },
              transaction,
            })

          const resultNoFilter =
            await selectSubscriptionsTableRowData({
              input: {
                pageSize: 10,
                filters: {
                  organizationId: organization.id,
                },
              },
              transaction,
            })

          // All should return all 3 subscriptions
          expect(resultEmpty.items.length).toBe(3)
          expect(resultEmpty.total).toBe(3)
          expect(resultWhitespace.items.length).toBe(3)
          expect(resultWhitespace.total).toBe(3)
          expect(resultNoFilter.items.length).toBe(3)
          expect(resultNoFilter.total).toBe(3)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should only return subscriptions for the specified organization', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          // Filter by "Premium Plan" - should only return subscriptions from organization, not organization2
          const result = await selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: organization.id,
                productName: 'Premium Plan',
              } as SubscriptionTableFilters,
            },
            transaction,
          })

          expect(result.items.length).toBe(2)
          result.items.forEach((item) => {
            expect(item.subscription.organizationId).toBe(
              organization.id
            )
            // Product may be null for usage prices, but this test uses subscription prices
            expect(item.product!.name).toBe('Premium Plan')
          })
          expect(result.total).toBe(2)
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  describe('combined search and filter functionality', () => {
    it('should combine search and productName filter (AND semantics) with pagination', async () => {
      // Create another subscription with Premium Plan and customer name containing "bob"
      const customer4 = await setupCustomer({
        organizationId: organization.id,
        name: 'Bobby Johnson',
        email: 'bobby@example.com',
      })

      const paymentMethod4 = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer4.id,
      })

      const subscription4 = await setupSubscription({
        organizationId: organization.id,
        customerId: customer4.id,
        paymentMethodId: paymentMethod4.id,
        priceId: price1.id, // Premium Plan
        status: SubscriptionStatus.Active,
      })(
        await adminTransactionWithResult(async ({ transaction }) => {
          // Test search + filter combination
          const result = await selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'alice',
              filters: {
                organizationId: organization.id,
                productName: 'Premium Plan',
              } as SubscriptionTableFilters,
            },
            transaction,
          })

          expect(result.items.length).toBe(1)
          expect(result.items[0].subscription.id).toBe(
            subscription1.id
          )
          expect(result.items[0].customer.name).toBe('Alice Smith')
          // Product may be null for usage prices, but this test uses subscription prices
          expect(result.items[0].product!.name).toBe('Premium Plan')
          expect(result.total).toBe(1)

          // Test pagination with search + filter
          const page1 = await selectSubscriptionsTableRowData({
            input: {
              pageSize: 1,
              searchQuery: 'bob',
              filters: {
                organizationId: organization.id,
                productName: 'Premium Plan',
              } as SubscriptionTableFilters,
            },
            transaction,
          })

          expect(page1.items.length).toBe(1)
          expect(page1.total).toBe(2) // subscription2 and subscription4
          expect(page1.hasNextPage).toBe(true)

          const page2 = await selectSubscriptionsTableRowData({
            input: {
              pageSize: 1,
              pageAfter: page1.endCursor ?? undefined,
              searchQuery: 'bob',
              filters: {
                organizationId: organization.id,
                productName: 'Premium Plan',
              } as SubscriptionTableFilters,
            },
            transaction,
          })

          expect(page2.items.length).toBe(1)
          expect(page2.total).toBe(2)
          expect(page2.hasNextPage).toBe(false)

          // Verify both pages have correct data
          const allItems = [...page1.items, ...page2.items]
          const customerNames = allItems.map(
            (item) => item.customer.name
          )
          expect(customerNames).toContain('Bob Jones')
          expect(customerNames).toContain('Bobby Johnson')
          allItems.forEach((item) => {
            // Product may be null for usage prices, but this test uses subscription prices
            expect(item.product!.name).toBe('Premium Plan')
          })
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  describe('isFreePlan filter functionality', () => {
    let freeSubscription1: Subscription.Record
    let freeSubscription2: Subscription.Record
    let paidSubscription1: Subscription.Record
    let paidSubscription2: Subscription.Record

    beforeEach(async () => {
      // Create free plan subscriptions
      const customerFree1 = await setupCustomer({
        organizationId: organization.id,
        name: 'Free User 1',
        email: 'free1@example.com',
      })
      const paymentMethodFree1 = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customerFree1.id,
      })
      freeSubscription1 = await setupSubscription({
        organizationId: organization.id,
        customerId: customerFree1.id,
        paymentMethodId: paymentMethodFree1.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
        isFreePlan: true,
      })

      const customerFree2 = await setupCustomer({
        organizationId: organization.id,
        name: 'Free User 2',
        email: 'free2@example.com',
      })
      const paymentMethodFree2 = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customerFree2.id,
      })
      freeSubscription2 = await setupSubscription({
        organizationId: organization.id,
        customerId: customerFree2.id,
        paymentMethodId: paymentMethodFree2.id,
        priceId: price2.id,
        status: SubscriptionStatus.Active,
        isFreePlan: true,
      })

      // Create paid plan subscriptions
      const customerPaid1 = await setupCustomer({
        organizationId: organization.id,
        name: 'Paid User 1',
        email: 'paid1@example.com',
      })
      const paymentMethodPaid1 = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customerPaid1.id,
      })
      paidSubscription1 = await setupSubscription({
        organizationId: organization.id,
        customerId: customerPaid1.id,
        paymentMethodId: paymentMethodPaid1.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
        isFreePlan: false,
      })

      const customerPaid2 = await setupCustomer({
        organizationId: organization.id,
        name: 'Paid User 2',
        email: 'paid2@example.com',
      })
      const paymentMethodPaid2 = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customerPaid2.id,
      })
      paidSubscription2 = await setupSubscription({
        organizationId: organization.id,
        customerId: customerPaid2.id,
        paymentMethodId: paymentMethodPaid2.id,
        priceId: price2.id,
        status: SubscriptionStatus.Active,
        isFreePlan: false,
      })
    })

    it('should return only free plan subscriptions when isFreePlan: true', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const result = await selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: organization.id,
                isFreePlan: true,
              } as SubscriptionTableFilters,
            },
            transaction,
          })

          expect(result.items.length).toBe(2)
          const subscriptionIds = result.items.map(
            (item) => item.subscription.id
          )
          expect(subscriptionIds).toContain(freeSubscription1.id)
          expect(subscriptionIds).toContain(freeSubscription2.id)
          expect(subscriptionIds).not.toContain(paidSubscription1.id)
          expect(subscriptionIds).not.toContain(paidSubscription2.id)
          result.items.forEach((item) => {
            expect(item.subscription.isFreePlan).toBe(true)
          })
          expect(result.total).toBe(2)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should return only paid subscriptions when isFreePlan: false', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const result = await selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: organization.id,
                isFreePlan: false,
              } as SubscriptionTableFilters,
            },
            transaction,
          })

          // 5 total: 3 from main beforeEach (default isFreePlan: false) + 2 from this beforeEach
          expect(result.items.length).toBe(5)
          const subscriptionIds = result.items.map(
            (item) => item.subscription.id
          )
          // Should include paid subscriptions from this beforeEach
          expect(subscriptionIds).toContain(paidSubscription1.id)
          expect(subscriptionIds).toContain(paidSubscription2.id)
          // Should include subscriptions from main beforeEach (default isFreePlan: false)
          expect(subscriptionIds).toContain(subscription1.id)
          expect(subscriptionIds).toContain(subscription2.id)
          expect(subscriptionIds).toContain(subscription3.id)
          // Should NOT include free subscriptions
          expect(subscriptionIds).not.toContain(freeSubscription1.id)
          expect(subscriptionIds).not.toContain(freeSubscription2.id)
          result.items.forEach((item) => {
            expect(item.subscription.isFreePlan).toBe(false)
          })
          expect(result.total).toBe(5)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should return all subscriptions when isFreePlan is undefined', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const result = await selectSubscriptionsTableRowData({
            input: {
              pageSize: 20,
              filters: {
                organizationId: organization.id,
              },
            },
            transaction,
          })

          // Should return all 7 subscriptions (3 from main beforeEach + 4 from this beforeEach)
          expect(result.items.length).toBe(7)
          expect(result.total).toBe(7)
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  describe('combined isFreePlan with other filters', () => {
    let freeSubscriptionPremium: Subscription.Record
    let paidSubscriptionPremium: Subscription.Record
    let freeSubscriptionBasic: Subscription.Record
    let paidSubscriptionBasic: Subscription.Record
    let activeFreeSub: Subscription.Record
    let canceledFreeSub: Subscription.Record
    let activePaidSub: Subscription.Record
    let canceledPaidSub: Subscription.Record

    beforeEach(async () => {
      // Create subscriptions for combined filter tests
      const customerA = await setupCustomer({
        organizationId: organization.id,
        name: 'Customer A',
        email: 'a@example.com',
      })
      const paymentMethodA = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customerA.id,
      })
      freeSubscriptionPremium = await setupSubscription({
        organizationId: organization.id,
        customerId: customerA.id,
        paymentMethodId: paymentMethodA.id,
        priceId: price1.id, // Premium Plan
        status: SubscriptionStatus.Active,
        isFreePlan: true,
      })

      const customerB = await setupCustomer({
        organizationId: organization.id,
        name: 'Customer B',
        email: 'b@example.com',
      })
      const paymentMethodB = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customerB.id,
      })
      paidSubscriptionPremium = await setupSubscription({
        organizationId: organization.id,
        customerId: customerB.id,
        paymentMethodId: paymentMethodB.id,
        priceId: price1.id, // Premium Plan
        status: SubscriptionStatus.Active,
        isFreePlan: false,
      })

      const customerC = await setupCustomer({
        organizationId: organization.id,
        name: 'Customer C',
        email: 'c@example.com',
      })
      const paymentMethodC = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customerC.id,
      })
      freeSubscriptionBasic = await setupSubscription({
        organizationId: organization.id,
        customerId: customerC.id,
        paymentMethodId: paymentMethodC.id,
        priceId: price2.id, // Basic Plan
        status: SubscriptionStatus.Active,
        isFreePlan: true,
      })

      const customerD = await setupCustomer({
        organizationId: organization.id,
        name: 'Customer D',
        email: 'd@example.com',
      })
      const paymentMethodD = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customerD.id,
      })
      paidSubscriptionBasic = await setupSubscription({
        organizationId: organization.id,
        customerId: customerD.id,
        paymentMethodId: paymentMethodD.id,
        priceId: price2.id, // Basic Plan
        status: SubscriptionStatus.Active,
        isFreePlan: false,
      })

      // Create subscriptions for status + isFreePlan combined test
      const customerE = await setupCustomer({
        organizationId: organization.id,
        name: 'Customer E',
        email: 'e@example.com',
      })
      const paymentMethodE = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customerE.id,
      })
      activeFreeSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customerE.id,
        paymentMethodId: paymentMethodE.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
        isFreePlan: true,
      })

      const customerF = await setupCustomer({
        organizationId: organization.id,
        name: 'Customer F',
        email: 'f@example.com',
      })
      const paymentMethodF = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customerF.id,
      })
      canceledFreeSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customerF.id,
        paymentMethodId: paymentMethodF.id,
        priceId: price1.id,
        status: SubscriptionStatus.Canceled,
        isFreePlan: true,
      })

      const customerG = await setupCustomer({
        organizationId: organization.id,
        name: 'Customer G',
        email: 'g@example.com',
      })
      const paymentMethodG = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customerG.id,
      })
      activePaidSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customerG.id,
        paymentMethodId: paymentMethodG.id,
        priceId: price1.id,
        status: SubscriptionStatus.Active,
        isFreePlan: false,
      })

      const customerH = await setupCustomer({
        organizationId: organization.id,
        name: 'Customer H',
        email: 'h@example.com',
      })
      const paymentMethodH = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customerH.id,
      })
      canceledPaidSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customerH.id,
        paymentMethodId: paymentMethodH.id,
        priceId: price1.id,
        status: SubscriptionStatus.Canceled,
        isFreePlan: false,
      })
    })

    it('should combine isFreePlan and productName filters', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const result = await selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: organization.id,
                isFreePlan: false,
                productName: 'Premium Plan',
              } as SubscriptionTableFilters,
            },
            transaction,
          })

          // Should return paid subscriptions with Premium Plan:
          // - subscription1, subscription2 from main beforeEach (price1 = Premium Plan, default isFreePlan: false)
          // - paidSubscriptionPremium, activePaidSub, canceledPaidSub from this beforeEach
          expect(result.items.length).toBe(5)
          const subscriptionIds = result.items.map(
            (item) => item.subscription.id
          )
          expect(subscriptionIds).toContain(
            paidSubscriptionPremium.id
          )
          expect(subscriptionIds).toContain(activePaidSub.id)
          expect(subscriptionIds).toContain(canceledPaidSub.id)
          expect(subscriptionIds).toContain(subscription1.id)
          expect(subscriptionIds).toContain(subscription2.id)
          result.items.forEach((item) => {
            expect(item.subscription.isFreePlan).toBe(false)
            // Product may be null for usage prices, but this test uses subscription prices
            expect(item.product!.name).toBe('Premium Plan')
          })
          expect(result.total).toBe(5)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should combine isFreePlan and status filters', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const result = await selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: organization.id,
                isFreePlan: false,
                status: SubscriptionStatus.Active,
              } as SubscriptionTableFilters,
            },
            transaction,
          })

          // Should only return active paid subscriptions
          const subscriptionIds = result.items.map(
            (item) => item.subscription.id
          )
          expect(subscriptionIds).toContain(activePaidSub.id)
          expect(subscriptionIds).not.toContain(canceledPaidSub.id)
          expect(subscriptionIds).not.toContain(activeFreeSub.id)
          expect(subscriptionIds).not.toContain(canceledFreeSub.id)

          result.items.forEach((item) => {
            expect(item.subscription.isFreePlan).toBe(false)
            expect(item.subscription.status).toBe(
              SubscriptionStatus.Active
            )
          })
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle invalid inputs gracefully and maintain correct total count', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          // Test null/undefined searchQuery
          const resultUndefined =
            await selectSubscriptionsTableRowData({
              input: {
                pageSize: 10,
                searchQuery: undefined,
                filters: { organizationId: organization.id },
              },
              transaction,
            })
          expect(resultUndefined.items.length).toBe(3)
          expect(resultUndefined.total).toBe(3)

          // Test non-string productName
          const resultInvalidProduct =
            await selectSubscriptionsTableRowData({
              input: {
                pageSize: 10,
                filters: {
                  organizationId: organization.id,
                  // @ts-expect-error - Testing invalid input: productName should be string, not number
                  productName: 123, // Non-string value
                },
              },
              transaction,
            })
          // Should ignore the invalid productName and return all subscriptions
          expect(resultInvalidProduct.items.length).toBe(3)
          expect(resultInvalidProduct.total).toBe(3)

          // Test total count accuracy with search + filter
          const resultWithFilters =
            await selectSubscriptionsTableRowData({
              input: {
                pageSize: 1, // Small page size
                searchQuery: 'alice',
                filters: {
                  organizationId: organization.id,
                  productName: 'Premium Plan',
                } as SubscriptionTableFilters,
              },
              transaction,
            })

          // Should return 1 item but total should be 1 (not items.length)
          expect(resultWithFilters.items.length).toBe(1)
          expect(resultWithFilters.total).toBe(1)
          expect(resultWithFilters.hasNextPage).toBe(false)
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  describe('usage price handling', () => {
    it('returns subscription with null product when price is a usage price (which has null productId)', async () => {
      // Setup a new organization with a usage meter and usage price
      const { organization: org, pricingModel: pm } = await setupOrg()
      const usageMeter = await setupUsageMeter({
        organizationId: org.id,
        pricingModelId: pm.id,
        name: 'API Calls Meter',
      })

      // Create usage price (usage prices have null productId)
      const usagePrice = await setupPrice({
        type: PriceType.Usage,
        name: 'Usage Price',
        unitPrice: 10,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        usageMeterId: usageMeter.id,
      })

      const usageCustomer = await setupCustomer({
        organizationId: org.id,
        name: 'Usage Customer',
        email: 'usage@example.com',
      })

      const usagePaymentMethod = await setupPaymentMethod({
        organizationId: org.id,
        customerId: usageCustomer.id,
      })

      // Create subscription with usage price
      const usageSubscription = await setupSubscription({
        organizationId: org.id,
        customerId: usageCustomer.id,
        paymentMethodId: usagePaymentMethod.id,
        priceId: usagePrice.id,
        status: SubscriptionStatus.Active,
      })(
        await adminTransactionWithResult(async ({ transaction }) => {
          const result = await selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              filters: { organizationId: org.id },
            },
            transaction,
          })

          // Find the subscription with usage price
          const usageSubRow = result.items.find(
            (item) => item.subscription.id === usageSubscription.id
          )

          // Verify the subscription is returned with expected id
          expect(usageSubRow?.subscription.id).toBe(
            usageSubscription.id
          )
          expect(usageSubRow!.subscription.priceId).toBe(
            usagePrice.id
          )
          expect(usageSubRow!.price.id).toBe(usagePrice.id)
          expect(usageSubRow!.price.type).toBe(PriceType.Usage)
          // Usage prices have null product
          expect(usageSubRow!.product).toBeNull()
          expect(usageSubRow!.customer.id).toBe(usageCustomer.id)
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })
})

describe('insertSubscription', () => {
  let organization: Organization.Record
  let pricingModel: { id: string }
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let product: { id: string }
  let price: { id: string }

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    customer = await setupCustomer({
      organizationId: organization.id,
    })

    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    product = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Test Product',
    })

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
    })
  })

  it('should derive pricingModelId from price', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const subscription = await insertSubscription(
          {
            organizationId: organization.id,
            customerId: customer.id,
            priceId: price.id,
            defaultPaymentMethodId: paymentMethod.id,
            backupPaymentMethodId: null,
            status: SubscriptionStatus.Active,
            livemode: true,
            startDate: Date.now(),
            trialEnd: null,
            currentBillingPeriodStart: Date.now(),
            currentBillingPeriodEnd:
              Date.now() + 30 * 24 * 60 * 60 * 1000,
            billingCycleAnchorDate: Date.now(),
            canceledAt: null,
            cancelScheduledAt: null,
            metadata: {},
            stripeSetupIntentId: `si_${core.nanoid()}`,
            name: 'Test Subscription',
            runBillingAtPeriodStart: true,
            externalId: null,
            interval: IntervalUnit.Month,
            intervalCount: 1,
            renews: true,
            isFreePlan: false,
            doNotCharge: false,
            cancellationReason: null,
            replacedBySubscriptionId: null,
          },
          transaction
        )

        // Verify pricingModelId was derived from price
        expect(subscription.pricingModelId).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('should use provided pricingModelId without derivation', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const subscription = await insertSubscription(
          {
            organizationId: organization.id,
            customerId: customer.id,
            priceId: price.id,
            defaultPaymentMethodId: paymentMethod.id,
            backupPaymentMethodId: null,
            status: SubscriptionStatus.Active,
            livemode: true,
            startDate: Date.now(),
            trialEnd: null,
            currentBillingPeriodStart: Date.now(),
            currentBillingPeriodEnd:
              Date.now() + 30 * 24 * 60 * 60 * 1000,
            billingCycleAnchorDate: Date.now(),
            canceledAt: null,
            cancelScheduledAt: null,
            metadata: {},
            stripeSetupIntentId: `si_${core.nanoid()}`,
            name: 'Test Subscription',
            runBillingAtPeriodStart: true,
            externalId: null,
            interval: IntervalUnit.Month,
            intervalCount: 1,
            renews: true,
            isFreePlan: false,
            doNotCharge: false,
            cancellationReason: null,
            replacedBySubscriptionId: null,
            pricingModelId: pricingModel.id, // Pre-provided
          },
          transaction
        )

        // Verify the provided pricingModelId is used
        expect(subscription.pricingModelId).toBe(pricingModel.id)
        return Result.ok(undefined)
      })
    ).unwrap()
  })
})

describe('bulkInsertOrDoNothingSubscriptionsByExternalId', () => {
  let organization: Organization.Record
  let pricingModel: { id: string }
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let product: { id: string }
  let price1: { id: string }
  let price2: { id: string }

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    customer = await setupCustomer({
      organizationId: organization.id,
    })

    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    product = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Test Product',
    })

    price1 = await setupPrice({
      productId: product.id,
      name: 'Test Price 1',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
    })

    price2 = await setupPrice({
      productId: product.id,
      name: 'Test Price 2',
      type: PriceType.Subscription,
      unitPrice: 2000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
    })
  })

  it('should bulk insert subscriptions and derive pricingModelId for each', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const externalId1 = `ext_sub_1_${core.nanoid()}`
        const externalId2 = `ext_sub_2_${core.nanoid()}`

        await bulkInsertOrDoNothingSubscriptionsByExternalId(
          [
            {
              organizationId: organization.id,
              customerId: customer.id,
              priceId: price1.id,
              defaultPaymentMethodId: paymentMethod.id,
              backupPaymentMethodId: null,
              status: SubscriptionStatus.Active,
              livemode: true,
              startDate: Date.now(),
              trialEnd: null,
              currentBillingPeriodStart: Date.now(),
              currentBillingPeriodEnd:
                Date.now() + 30 * 24 * 60 * 60 * 1000,
              billingCycleAnchorDate: Date.now(),
              canceledAt: null,
              cancelScheduledAt: null,
              metadata: {},
              stripeSetupIntentId: `si_${core.nanoid()}`,
              name: 'Test Subscription 1',
              runBillingAtPeriodStart: true,
              externalId: externalId1,
              interval: IntervalUnit.Month,
              intervalCount: 1,
              renews: true,
              isFreePlan: false,
              doNotCharge: false,
              cancellationReason: null,
              replacedBySubscriptionId: null,
            },
            {
              organizationId: organization.id,
              customerId: customer.id,
              priceId: price2.id,
              defaultPaymentMethodId: paymentMethod.id,
              backupPaymentMethodId: null,
              status: SubscriptionStatus.Active,
              livemode: true,
              startDate: Date.now(),
              trialEnd: null,
              currentBillingPeriodStart: Date.now(),
              currentBillingPeriodEnd:
                Date.now() + 30 * 24 * 60 * 60 * 1000,
              billingCycleAnchorDate: Date.now(),
              canceledAt: null,
              cancelScheduledAt: null,
              metadata: {},
              stripeSetupIntentId: `si_${core.nanoid()}`,
              name: 'Test Subscription 2',
              runBillingAtPeriodStart: true,
              externalId: externalId2,
              interval: IntervalUnit.Month,
              intervalCount: 1,
              renews: true,
              isFreePlan: false,
              doNotCharge: false,
              cancellationReason: null,
              replacedBySubscriptionId: null,
            },
          ],
          transaction
        )

        // Verify by selecting the inserted subscriptions
        const insertedSubscriptions = await selectSubscriptions(
          { externalId: [externalId1, externalId2] },
          transaction
        )

        expect(insertedSubscriptions.length).toBe(2)
        insertedSubscriptions.forEach((sub) => {
          expect(sub.pricingModelId).toBe(pricingModel.id)
        })
        return Result.ok(undefined)
      })
    ).unwrap()
  })
})

describe('derivePricingModelIdFromSubscription', () => {
  let organization: Organization.Record
  let pricingModel: { id: string }
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let product: { id: string }
  let price: { id: string }
  let subscription: Subscription.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    customer = await setupCustomer({
      organizationId: organization.id,
    })

    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    product = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Test Product',
    })

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
    })
  })

  it('should derive pricingModelId from an existing subscription', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const derivedPricingModelId =
          await derivePricingModelIdFromSubscription(
            subscription.id,
            transaction
          )

        expect(derivedPricingModelId).toBe(pricingModel.id)
        expect(derivedPricingModelId).toBe(
          subscription.pricingModelId
        )
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('should throw error when subscription does not exist', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const nonExistentSubscriptionId = `sub_${core.nanoid()}`

        await expect(
          derivePricingModelIdFromSubscription(
            nonExistentSubscriptionId,
            transaction
          )
        ).rejects.toThrow()
        return Result.ok(undefined)
      })
    ).unwrap()
  })
})

describe('TERMINAL_SUBSCRIPTION_STATES', () => {
  it('includes Canceled and IncompleteExpired statuses', () => {
    expect(TERMINAL_SUBSCRIPTION_STATES).toContain(
      SubscriptionStatus.Canceled
    )
    expect(TERMINAL_SUBSCRIPTION_STATES).toContain(
      SubscriptionStatus.IncompleteExpired
    )
    expect(TERMINAL_SUBSCRIPTION_STATES.length).toBe(2)
  })
})

describe('isSubscriptionInTerminalState', () => {
  it('returns true for Canceled status', () => {
    expect(
      isSubscriptionInTerminalState(SubscriptionStatus.Canceled)
    ).toBe(true)
  })

  it('returns true for IncompleteExpired status', () => {
    expect(
      isSubscriptionInTerminalState(
        SubscriptionStatus.IncompleteExpired
      )
    ).toBe(true)
  })

  it('returns false for Active status', () => {
    expect(
      isSubscriptionInTerminalState(SubscriptionStatus.Active)
    ).toBe(false)
  })

  it('returns false for Trialing status', () => {
    expect(
      isSubscriptionInTerminalState(SubscriptionStatus.Trialing)
    ).toBe(false)
  })

  it('returns false for PastDue status', () => {
    expect(
      isSubscriptionInTerminalState(SubscriptionStatus.PastDue)
    ).toBe(false)
  })

  it('returns false for CancellationScheduled status', () => {
    expect(
      isSubscriptionInTerminalState(
        SubscriptionStatus.CancellationScheduled
      )
    ).toBe(false)
  })
})

describe('assertSubscriptionNotTerminal', () => {
  it('throws SubscriptionTerminalStateError for subscription with Canceled status', () => {
    const subscription = {
      id: 'sub_test_123',
      status: SubscriptionStatus.Canceled,
    } as Subscription.Record

    expect(() => assertSubscriptionNotTerminal(subscription)).toThrow(
      SubscriptionTerminalStateError
    )
    expect(() => assertSubscriptionNotTerminal(subscription)).toThrow(
      'Cannot mutate subscription sub_test_123 in terminal state: canceled'
    )
  })

  it('throws SubscriptionTerminalStateError for subscription with IncompleteExpired status', () => {
    const subscription = {
      id: 'sub_test_456',
      status: SubscriptionStatus.IncompleteExpired,
    } as Subscription.Record

    expect(() => assertSubscriptionNotTerminal(subscription)).toThrow(
      SubscriptionTerminalStateError
    )
    expect(() => assertSubscriptionNotTerminal(subscription)).toThrow(
      'Cannot mutate subscription sub_test_456 in terminal state: incomplete_expired'
    )
  })

  it('does not throw for subscription with Active status', () => {
    const subscription = {
      id: 'sub_test_789',
      status: SubscriptionStatus.Active,
    } as Subscription.Record

    expect(() =>
      assertSubscriptionNotTerminal(subscription)
    ).not.toThrow()
  })

  it('does not throw for subscription with Trialing status', () => {
    const subscription = {
      id: 'sub_test_101',
      status: SubscriptionStatus.Trialing,
    } as Subscription.Record

    expect(() =>
      assertSubscriptionNotTerminal(subscription)
    ).not.toThrow()
  })

  it('does not throw for subscription with PastDue status', () => {
    const subscription = {
      id: 'sub_test_102',
      status: SubscriptionStatus.PastDue,
    } as Subscription.Record

    expect(() =>
      assertSubscriptionNotTerminal(subscription)
    ).not.toThrow()
  })

  it('does not throw for subscription with CancellationScheduled status', () => {
    const subscription = {
      id: 'sub_test_103',
      status: SubscriptionStatus.CancellationScheduled,
    } as Subscription.Record

    expect(() =>
      assertSubscriptionNotTerminal(subscription)
    ).not.toThrow()
  })
})
