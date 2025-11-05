import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectSubscriptionsTableRowData,
  selectDistinctSubscriptionProductNames,
} from './subscriptionMethods'
import {
  setupOrg,
  setupSubscription,
  setupProduct,
  setupPrice,
  setupPaymentMethod,
} from '@/../seedDatabase'
import { insertCustomer } from './customerMethods'
import {
  SubscriptionStatus,
  PaymentMethodType,
  PriceType,
  IntervalUnit,
  CurrencyCode,
} from '@/types'
import core from '@/utils/core'
import { Customer } from '@/db/schema/customers'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { Subscription } from '@/db/schema/subscriptions'
import { PaymentMethod } from '@/db/schema/paymentMethods'

// Shared test data structure
interface TestData {
  org1: Awaited<ReturnType<typeof setupOrg>>
  org2: Awaited<ReturnType<typeof setupOrg>>
  products: {
    productA: Product.Record
    productB: Product.Record
    productSpecial: Product.Record
  }
  prices: {
    priceA: Price.Record
    priceB: Price.Record
    priceSpecial: Price.Record
  }
  customers: {
    johnDoe: Customer.Record
    janeSmith: Customer.Record
    otherOrg: Customer.Record
    specialChars: Customer.Record
    unicode: Customer.Record
  }
  paymentMethods: {
    johnPm: PaymentMethod.Record
    janePm: PaymentMethod.Record
    specialPm: PaymentMethod.Record
    unicodePm: PaymentMethod.Record
  }
  subscriptions: {
    johnProductA: Subscription.Record
    janeProductA: Subscription.Record
    johnProductB: Subscription.Record
    johnProductA2: Subscription.Record
    janeProductA2: Subscription.Record
    specialProductSpecial: Subscription.Record
    unicodeDefault: Subscription.Record
    otherOrg: Subscription.Record
  }
}

describe('selectSubscriptionsTableRowData', () => {
  let testData: TestData

  beforeEach(async () => {
    // Set up organizations
    const org1 = await setupOrg()
    const org2 = await setupOrg()

    // Set up products
    const products = {
      productA: await setupProduct({
        organizationId: org1.organization.id,
        name: 'Product A',
        livemode: true,
        pricingModelId: org1.pricingModel.id,
      }),
      productB: await setupProduct({
        organizationId: org1.organization.id,
        name: 'Product B',
        livemode: true,
        pricingModelId: org1.pricingModel.id,
      }),
      productSpecial: await setupProduct({
        organizationId: org1.organization.id,
        name: "Product O'Brien",
        livemode: true,
        pricingModelId: org1.pricingModel.id,
      }),
    }

    // Set up prices
    const prices = {
      priceA: await setupPrice({
        productId: products.productA.id,
        name: 'Price for Product A',
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
      }),
      priceB: await setupPrice({
        productId: products.productB.id,
        name: 'Price for Product B',
        type: PriceType.Subscription,
        unitPrice: 2000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
      }),
      priceSpecial: await setupPrice({
        productId: products.productSpecial.id,
        name: 'Price for Special Product',
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
      }),
    }

    // Set up customers with various names
    const customers = {
      johnDoe: await adminTransaction(async ({ transaction }) => {
        const customer = await insertCustomer(
          {
            organizationId: org1.organization.id,
            name: 'John Doe',
            email: `john+${core.nanoid()}@test.com`,
            externalId: core.nanoid(),
            livemode: true,
          },
          transaction
        )
        return customer
      }),
      janeSmith: await adminTransaction(async ({ transaction }) => {
        const customer = await insertCustomer(
          {
            organizationId: org1.organization.id,
            name: 'Jane Smith',
            email: `jane+${core.nanoid()}@test.com`,
            externalId: core.nanoid(),
            livemode: true,
          },
          transaction
        )
        return customer
      }),
      otherOrg: await adminTransaction(async ({ transaction }) => {
        const customer = await insertCustomer(
          {
            organizationId: org2.organization.id,
            name: 'Other Org Customer',
            email: `other+${core.nanoid()}@test.com`,
            externalId: core.nanoid(),
            livemode: true,
          },
          transaction
        )
        return customer
      }),
      specialChars: await adminTransaction(
        async ({ transaction }) => {
          const customer = await insertCustomer(
            {
              organizationId: org1.organization.id,
              name: "O'Brien-Smith",
              email: `special+${core.nanoid()}@test.com`,
              externalId: core.nanoid(),
              livemode: true,
            },
            transaction
          )
          return customer
        }
      ),
      unicode: await adminTransaction(async ({ transaction }) => {
        const customer = await insertCustomer(
          {
            organizationId: org1.organization.id,
            name: '测试 Café',
            email: `unicode+${core.nanoid()}@test.com`,
            externalId: core.nanoid(),
            livemode: true,
          },
          transaction
        )
        return customer
      }),
    }

    // Set up payment methods
    const paymentMethods = {
      johnPm: await setupPaymentMethod({
        organizationId: org1.organization.id,
        customerId: customers.johnDoe.id,
        type: PaymentMethodType.Card,
        livemode: true,
      }),
      janePm: await setupPaymentMethod({
        organizationId: org1.organization.id,
        customerId: customers.janeSmith.id,
        type: PaymentMethodType.Card,
        livemode: true,
      }),
      specialPm: await setupPaymentMethod({
        organizationId: org1.organization.id,
        customerId: customers.specialChars.id,
        type: PaymentMethodType.Card,
        livemode: true,
      }),
      unicodePm: await setupPaymentMethod({
        organizationId: org1.organization.id,
        customerId: customers.unicode.id,
        type: PaymentMethodType.Card,
        livemode: true,
      }),
    }

    // Set up subscriptions with various configurations
    const subscriptions = {
      johnProductA: await setupSubscription({
        organizationId: org1.organization.id,
        customerId: customers.johnDoe.id,
        paymentMethodId: paymentMethods.johnPm.id,
        priceId: prices.priceA.id,
        status: SubscriptionStatus.Active,
        livemode: true,
      }),
      janeProductA: await setupSubscription({
        organizationId: org1.organization.id,
        customerId: customers.janeSmith.id,
        paymentMethodId: paymentMethods.janePm.id,
        priceId: prices.priceA.id,
        status: SubscriptionStatus.Active,
        livemode: true,
      }),
      johnProductB: await setupSubscription({
        organizationId: org1.organization.id,
        customerId: customers.johnDoe.id,
        paymentMethodId: paymentMethods.johnPm.id,
        priceId: prices.priceB.id,
        status: SubscriptionStatus.Active,
        livemode: true,
      }),
      johnProductA2: await setupSubscription({
        organizationId: org1.organization.id,
        customerId: customers.johnDoe.id,
        paymentMethodId: paymentMethods.johnPm.id,
        priceId: prices.priceA.id,
        status: SubscriptionStatus.Active,
        livemode: true,
      }),
      janeProductA2: await setupSubscription({
        organizationId: org1.organization.id,
        customerId: customers.janeSmith.id,
        paymentMethodId: paymentMethods.janePm.id,
        priceId: prices.priceA.id,
        status: SubscriptionStatus.Active,
        livemode: true,
      }),
      specialProductSpecial: await setupSubscription({
        organizationId: org1.organization.id,
        customerId: customers.specialChars.id,
        paymentMethodId: paymentMethods.specialPm.id,
        priceId: prices.priceSpecial.id,
        status: SubscriptionStatus.Active,
        livemode: true,
      }),
      unicodeDefault: await setupSubscription({
        organizationId: org1.organization.id,
        customerId: customers.unicode.id,
        paymentMethodId: paymentMethods.unicodePm.id,
        priceId: org1.price.id,
        status: SubscriptionStatus.Active,
        livemode: true,
      }),
      otherOrg: await setupSubscription({
        organizationId: org2.organization.id,
        customerId: customers.otherOrg.id,
        priceId: org2.price.id,
        status: SubscriptionStatus.Active,
        livemode: true,
      }),
    }

    testData = {
      org1,
      org2,
      products,
      prices,
      customers,
      paymentMethods,
      subscriptions,
    }
  })

  describe('Search functionality', () => {
    it('should search by subscription ID (exact match only)', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: testData.subscriptions.johnProductA.id,
            },
            transaction,
          })
        }
      )

      expect(result.items.length).toBe(1)
      expect(result.items[0].subscription.id).toBe(
        testData.subscriptions.johnProductA.id
      )

      // Partial ID should not match
      const partialId =
        testData.subscriptions.johnProductA.id.substring(
          0,
          testData.subscriptions.johnProductA.id.length / 2
        )
      const partialResult = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: partialId,
            },
            transaction,
          })
        }
      )
      expect(
        partialResult.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.johnProductA.id
        )
      ).toBe(false)

      // Non-existent ID should return empty
      const nonExistentId = `sub_${core.nanoid()}`
      const emptyResult = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: nonExistentId,
            },
            transaction,
          })
        }
      )
      expect(emptyResult.items.length).toBe(0)
      expect(emptyResult.total).toBe(0)
    })

    it('should search by customer name (partial, case-insensitive)', async () => {
      // Search for "John" - should match John Doe
      const resultJohn = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'John',
            },
            transaction,
          })
        }
      )
      expect(
        resultJohn.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.johnProductA.id
        )
      ).toBe(true)
      expect(
        resultJohn.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.johnProductB.id
        )
      ).toBe(true)
      expect(
        resultJohn.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.johnProductA2.id
        )
      ).toBe(true)

      // Search for "Doe" - should match John Doe
      const resultDoe = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'Doe',
            },
            transaction,
          })
        }
      )
      expect(
        resultDoe.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.johnProductA.id
        )
      ).toBe(true)

      // Case-insensitive search
      const resultLower = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'john',
            },
            transaction,
          })
        }
      )
      expect(
        resultLower.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.johnProductA.id
        )
      ).toBe(true)

      const resultUpper = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'JOHN',
            },
            transaction,
          })
        }
      )
      expect(
        resultUpper.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.johnProductA.id
        )
      ).toBe(true)

      // Search for "J" should match both John and Jane
      const resultJ = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'J',
            },
            transaction,
          })
        }
      )
      expect(
        resultJ.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.johnProductA.id
        )
      ).toBe(true)
      expect(
        resultJ.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.janeProductA.id
        )
      ).toBe(true)
    })

    it('should return multiple subscriptions for same customer', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'John',
            },
            transaction,
          })
        }
      )

      const johnSubscriptionIds = new Set(
        result.items
          .filter(
            (item) =>
              item.customer.id === testData.customers.johnDoe.id
          )
          .map((item) => item.subscription.id)
      )
      expect(
        johnSubscriptionIds.has(
          testData.subscriptions.johnProductA.id
        )
      ).toBe(true)
      expect(
        johnSubscriptionIds.has(
          testData.subscriptions.johnProductB.id
        )
      ).toBe(true)
      expect(
        johnSubscriptionIds.has(
          testData.subscriptions.johnProductA2.id
        )
      ).toBe(true)
    })

    it('should handle special characters and unicode in customer names', async () => {
      // Special characters
      const resultSpecial = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: "O'Brien",
            },
            transaction,
          })
        }
      )
      expect(
        resultSpecial.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.specialProductSpecial.id
        )
      ).toBe(true)

      // Unicode characters
      const resultUnicode = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: '测试',
            },
            transaction,
          })
        }
      )
      expect(
        resultUnicode.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.unicodeDefault.id
        )
      ).toBe(true)
    })

    it('should handle empty, undefined, whitespace, and null search queries', async () => {
      // Empty string
      const resultEmpty = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: '',
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(resultEmpty.items.length).toBeGreaterThanOrEqual(2)

      // Undefined
      const resultUndefined = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(resultUndefined.items.length).toBeGreaterThanOrEqual(2)

      // Whitespace only
      const resultWhitespace = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: '   ',
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(resultWhitespace.items.length).toBeGreaterThanOrEqual(2)

      // Null
      const resultNull = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: null as any,
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(resultNull.items.length).toBeGreaterThanOrEqual(2)
    })

    it('should paginate correctly with search applied', async () => {
      const firstPage = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 2,
              searchQuery: 'John',
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )

      expect(firstPage.items.length).toBe(2)
      expect(firstPage.hasNextPage).toBe(true)

      const secondPage = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 2,
              pageAfter: firstPage.endCursor!,
              searchQuery: 'John',
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )

      expect(secondPage.items.length).toBeGreaterThanOrEqual(1)
      // Verify no overlap
      const firstPageIds = new Set(
        firstPage.items.map((item) => item.subscription.id)
      )
      const secondPageIds = new Set(
        secondPage.items.map((item) => item.subscription.id)
      )
      const intersection = new Set(
        [...firstPageIds].filter((id) => secondPageIds.has(id))
      )
      expect(intersection.size).toBe(0)
    })

    it('should return correct total count with search applied', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'John',
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )

      expect(result.total).toBeGreaterThanOrEqual(3)
      expect(
        result.items.every((item) =>
          item.customer.name.toLowerCase().includes('john')
        )
      ).toBe(true)
    })

    it('should only return results from the authenticated organization', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )

      // Should only contain subscriptions from org1
      expect(
        result.items.every(
          (item) =>
            item.subscription.organizationId ===
            testData.org1.organization.id
        )
      ).toBe(true)
      expect(
        result.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.johnProductA.id
        )
      ).toBe(true)
      expect(
        result.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.janeProductA.id
        )
      ).toBe(true)
      // Should not contain subscription from org2
      expect(
        result.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.otherOrg.id
        )
      ).toBe(false)
    })
  })

  describe('Filter functionality', () => {
    it('should filter by product name (exact match)', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: testData.org1.organization.id,
                productName: 'Product A',
              } as any,
            },
            transaction,
          })
        }
      )

      // Should only contain subscriptions with Product A
      expect(
        result.items.every(
          (item) => item.product.name === 'Product A'
        )
      ).toBe(true)
      expect(
        result.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.johnProductA.id
        )
      ).toBe(true)
      expect(
        result.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.janeProductA.id
        )
      ).toBe(true)
      expect(
        result.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.johnProductB.id
        )
      ).toBe(false)

      // Partial match should not work
      const resultPartial = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: testData.org1.organization.id,
                productName: 'Product',
              } as any,
            },
            transaction,
          })
        }
      )
      expect(resultPartial.items.length).toBe(0)
    })

    it('should return multiple subscriptions for same product', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: testData.org1.organization.id,
                productName: 'Product A',
              } as any,
            },
            transaction,
          })
        }
      )

      // Should contain multiple subscriptions for Product A
      const productASubscriptionIds = result.items
        .filter((item) => item.product.name === 'Product A')
        .map((item) => item.subscription.id)
      expect(productASubscriptionIds.length).toBeGreaterThanOrEqual(2)
      expect(productASubscriptionIds).toContain(
        testData.subscriptions.johnProductA.id
      )
      expect(productASubscriptionIds).toContain(
        testData.subscriptions.janeProductA.id
      )
    })

    it('should return empty result when no subscriptions match product name', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: testData.org1.organization.id,
                productName: 'Non-existent Product',
              } as any,
            },
            transaction,
          })
        }
      )

      expect(result.items.length).toBe(0)
      expect(result.total).toBe(0)
    })

    it('should handle product names with special characters', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: testData.org1.organization.id,
                productName: "Product O'Brien",
              } as any,
            },
            transaction,
          })
        }
      )

      expect(
        result.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.specialProductSpecial.id
        )
      ).toBe(true)
      expect(
        result.items.every(
          (item) => item.product.name === "Product O'Brien"
        )
      ).toBe(true)
    })

    it('should trim whitespace from product name filter', async () => {
      const resultWithSpaces = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: testData.org1.organization.id,
                productName: ' Product A ',
              } as any,
            },
            transaction,
          })
        }
      )
      expect(
        resultWithSpaces.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.johnProductA.id
        )
      ).toBe(true)

      const resultWithoutSpaces = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: testData.org1.organization.id,
                productName: 'Product A',
              } as any,
            },
            transaction,
          })
        }
      )
      expect(
        resultWithoutSpaces.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.johnProductA.id
        )
      ).toBe(true)
    })

    it('should handle empty, undefined, and whitespace product name filters', async () => {
      // Empty string
      const resultEmpty = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: testData.org1.organization.id,
                productName: '',
              } as { organizationId: string; productName: string },
            },
            transaction,
          })
        }
      )
      expect(resultEmpty.items.length).toBeGreaterThanOrEqual(2)

      // Undefined
      const resultUndefined = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: testData.org1.organization.id,
              },
            },
            transaction,
          })
        }
      )
      expect(resultUndefined.items.length).toBeGreaterThanOrEqual(2)

      // Whitespace only
      const resultWhitespace = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              filters: {
                organizationId: testData.org1.organization.id,
                productName: '   ',
              } as { organizationId: string; productName: string },
            },
            transaction,
          })
        }
      )
      expect(resultWhitespace.items.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Search + Filter combination', () => {
    it('should combine product filter AND search query (both must match)', async () => {
      // subscription1: Product A + John Doe
      // subscription2: Product A + Jane Smith
      // subscription3: Product B + John Doe
      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'John',
              filters: {
                organizationId: testData.org1.organization.id,
                productName: 'Product A',
              } as any,
            },
            transaction,
          })
        }
      )

      // Should only contain subscription1 (Product A + John)
      expect(
        result.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.johnProductA.id
        )
      ).toBe(true)
      expect(
        result.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.johnProductA2.id
        )
      ).toBe(true)
      expect(
        result.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.janeProductA.id
        )
      ).toBe(false)
      expect(
        result.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.johnProductB.id
        )
      ).toBe(false)
      expect(
        result.items.every(
          (item) => item.product.name === 'Product A'
        )
      ).toBe(true)
      expect(
        result.items.every((item) =>
          item.customer.name.toLowerCase().includes('john')
        )
      ).toBe(true)
    })

    it('should return empty result if product matches but search does not', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'Jane',
              filters: {
                organizationId: testData.org1.organization.id,
                productName: 'Product A',
              } as any,
            },
            transaction,
          })
        }
      )

      // Should not contain John's subscriptions (even though Product A matches)
      expect(
        result.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.johnProductA.id
        )
      ).toBe(false)
      expect(
        result.items.every((item) =>
          item.customer.name.toLowerCase().includes('jane')
        )
      ).toBe(true)
    })

    it('should return empty result if search matches but product does not', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'John',
              filters: {
                organizationId: testData.org1.organization.id,
                productName: 'Product B',
              } as any,
            },
            transaction,
          })
        }
      )

      // Should not contain John's Product A subscriptions (even though John matches)
      expect(
        result.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.johnProductA.id
        )
      ).toBe(false)
      // Should contain John's Product B subscription
      expect(
        result.items.some(
          (item) =>
            item.subscription.id ===
            testData.subscriptions.johnProductB.id
        )
      ).toBe(true)
      expect(
        result.items.every(
          (item) => item.product.name === 'Product B'
        )
      ).toBe(true)
    })

    it('should paginate correctly with search + filter applied', async () => {
      const firstPage = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 1,
              searchQuery: 'John',
              filters: {
                organizationId: testData.org1.organization.id,
                productName: 'Product A',
              } as any,
            },
            transaction,
          })
        }
      )

      expect(firstPage.items.length).toBe(1)
      expect(firstPage.hasNextPage).toBe(true)

      const secondPage = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 1,
              pageAfter: firstPage.endCursor!,
              searchQuery: 'John',
              filters: {
                organizationId: testData.org1.organization.id,
                productName: 'Product A',
              } as any,
            },
            transaction,
          })
        }
      )

      expect(secondPage.items.length).toBeGreaterThanOrEqual(1)
      // Verify no overlap
      const firstPageIds = new Set(
        firstPage.items.map((item) => item.subscription.id)
      )
      const secondPageIds = new Set(
        secondPage.items.map((item) => item.subscription.id)
      )
      const intersection = new Set(
        [...firstPageIds].filter((id) => secondPageIds.has(id))
      )
      expect(intersection.size).toBe(0)
    })

    it('should return correct total count with search + filter applied', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectSubscriptionsTableRowData({
            input: {
              pageSize: 10,
              searchQuery: 'John',
              filters: {
                organizationId: testData.org1.organization.id,
                productName: 'Product A',
              } as any,
            },
            transaction,
          })
        }
      )

      expect(result.total).toBeGreaterThanOrEqual(2)
      expect(
        result.items.every(
          (item) => item.product.name === 'Product A'
        )
      ).toBe(true)
      expect(
        result.items.every((item) =>
          item.customer.name.toLowerCase().includes('john')
        )
      ).toBe(true)
    })
  })

  describe('selectDistinctSubscriptionProductNames', () => {
    it('should return distinct product names without duplicates, respect organization isolation, and be sorted', async () => {
      // Test org1 - basic functionality and distinctness
      const resultOrg1 = await adminTransaction(
        async ({ transaction }) => {
          return selectDistinctSubscriptionProductNames(
            testData.org1.organization.id,
            transaction
          )
        }
      )

      // Should contain Product A and Product B from org1
      expect(resultOrg1).toContain('Product A')
      expect(resultOrg1).toContain('Product B')
      expect(resultOrg1.length).toBeGreaterThanOrEqual(2)

      // Should not contain duplicates (general check)
      const uniqueNames = new Set(resultOrg1)
      expect(uniqueNames.size).toBe(resultOrg1.length)

      // Should contain Product A only once (even though multiple subscriptions use it)
      const productACount = resultOrg1.filter(
        (name) => name === 'Product A'
      ).length
      expect(productACount).toBe(1)

      // Should be sorted alphabetically
      const sortedResultOrg1 = [...resultOrg1].sort()
      expect(resultOrg1).toEqual(sortedResultOrg1)

      // Test org2 - organization isolation
      const resultOrg2 = await adminTransaction(
        async ({ transaction }) => {
          return selectDistinctSubscriptionProductNames(
            testData.org2.organization.id,
            transaction
          )
        }
      )

      // Should only include products from org2 (default product)
      expect(resultOrg2.length).toBeGreaterThanOrEqual(1)
      // Should NOT include products from org1 (organization isolation)
      expect(resultOrg2).not.toContain('Product A')
      expect(resultOrg2).not.toContain('Product B')

      // Should be sorted alphabetically
      const sortedResultOrg2 = [...resultOrg2].sort()
      expect(resultOrg2).toEqual(sortedResultOrg2)
    })
  })
})
