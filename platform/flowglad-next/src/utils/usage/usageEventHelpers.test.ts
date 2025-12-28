import * as core from 'nanoid'
import { beforeEach, describe, expect, it } from 'vitest'
// Setup helpers from seedDatabase.ts
import {
  setupBillingPeriod,
  setupCustomer,
  setupLedgerAccount,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupPricingModel,
  setupProduct,
  setupSubscription,
  setupUsageEvent,
  setupUsageMeter,
} from '@/../seedDatabase'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Customer } from '@/db/schema/customers'
import type { LedgerEntry } from '@/db/schema/ledgerEntries'
import type { LedgerTransaction } from '@/db/schema/ledgerTransactions'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { Subscription } from '@/db/schema/subscriptions'
import type { CreateUsageEventInput } from '@/db/schema/usageEvents'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { selectLedgerEntries } from '@/db/tableMethods/ledgerEntryMethods'
import { selectLedgerTransactions } from '@/db/tableMethods/ledgerTransactionMethods'
import {
  CurrencyCode,
  IntervalUnit,
  LedgerTransactionInitiatingSourceType,
  LedgerTransactionType,
  PriceType,
  UsageMeterAggregationType,
} from '@/types'
// Function to test
import {
  createUsageEventWithSlugSchema,
  generateLedgerCommandsForBulkUsageEvents,
  ingestAndProcessUsageEvent,
  resolveUsageEventInput,
  shouldProcessUsageEventLedgerCommand,
} from '@/utils/usage/usageEventHelpers'

describe('usageEventHelpers', () => {
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let usagePrice: Price.Record
  let mainSubscription: Subscription.Record
  let mainBillingPeriod: BillingPeriod.Record
  let organization: Organization.Record
  let usageMeter: UsageMeter.Record
  let orgSetup: Awaited<ReturnType<typeof setupOrg>>
  beforeEach(async () => {
    await adminTransaction(async ({ transaction }) => {
      orgSetup = await setupOrg()
      organization = orgSetup.organization
      customer = await setupCustomer({
        organizationId: organization.id,
        pricingModelId: orgSetup.pricingModel.id,
      })
      paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })

      const defaultPricingModelForOrg = orgSetup.pricingModel
      const defaultProductForOrg = orgSetup.product
      usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Test Usage Meter',
        livemode: true,
        pricingModelId: defaultPricingModelForOrg.id,
      })
      usagePrice = await setupPrice({
        productId: defaultProductForOrg.id,
        name: 'Test Usage Price',
        type: PriceType.Usage,
        unitPrice: 10,
        intervalUnit: IntervalUnit.Day,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
        usageMeterId: usageMeter.id,
      })

      mainSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: usagePrice.id,
      })

      const now = new Date()
      const endDate = new Date(now)
      endDate.setDate(now.getDate() + 30)

      mainBillingPeriod = await setupBillingPeriod({
        subscriptionId: mainSubscription.id,
        startDate: now,
        endDate: endDate,
      })
    })
  })

  describe('ingestAndProcessUsageEvent', () => {
    it('should ingest and process a new usage event correctly (happy path)', async () => {
      const usageEventDetails: CreateUsageEventInput['usageEvent'] = {
        priceId: usagePrice.id,
        usageMeterId: usagePrice.usageMeterId!,
        subscriptionId: mainSubscription.id,
        transactionId: `txn_${core.nanoid()}`,
        amount: 10,
        usageDate: Date.now(),
        properties: { custom_field: 'happy_path_value' },
      }
      const input: CreateUsageEventInput = {
        usageEvent: usageEventDetails,
      }

      const { usageEvent: createdUsageEvent } =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            return ingestAndProcessUsageEvent(
              { input, livemode: true },
              transaction
            )
          }
        )

      expect(createdUsageEvent).toBeDefined()
      if (!createdUsageEvent)
        throw new Error(
          'Test setup failed: createdUsageEvent is null'
        )

      expect(createdUsageEvent.usageMeterId).toBe(
        usagePrice.usageMeterId
      )
      expect(createdUsageEvent.billingPeriodId).toBe(
        mainBillingPeriod.id
      )
      expect(createdUsageEvent.customerId).toBe(customer.id)
      expect(createdUsageEvent.livemode).toBe(true)
      expect(createdUsageEvent.properties).toEqual(
        usageEventDetails.properties
      )
      expect(
        new Date(createdUsageEvent.usageDate!).getTime()
      ).toEqual(usageEventDetails.usageDate)

      let ledgerTransactions: LedgerTransaction.Record[] = []
      await adminTransaction(async ({ transaction }) => {
        ledgerTransactions = await selectLedgerTransactions(
          {
            initiatingSourceId: createdUsageEvent!.id,
            initiatingSourceType:
              LedgerTransactionInitiatingSourceType.UsageEvent,
          },
          transaction
        )
      })
      expect(ledgerTransactions.length).toBe(1)
      const ledgerTransactionId = ledgerTransactions[0].id

      let ledgerItems: LedgerEntry.Record[] = []
      await adminTransaction(async ({ transaction }) => {
        ledgerItems = await selectLedgerEntries(
          { ledgerTransactionId },
          transaction
        )
      })
      expect(ledgerItems.length).toBeGreaterThan(0)
      expect(ledgerItems[0].amount).toBe(usageEventDetails.amount)
    })

    it('should return existing usage event if transactionId and usageMeterId match for the same subscription', async () => {
      const transactionId = `txn_idem_${core.nanoid()}`
      const initialEventDetails: CreateUsageEventInput['usageEvent'] =
        {
          priceId: usagePrice.id,
          usageMeterId: usagePrice.usageMeterId!,
          subscriptionId: mainSubscription.id,
          transactionId,
          amount: 5,
        }
      const { usageEvent: initialEvent } =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: initialEventDetails },
                livemode: true,
              },
              transaction
            )
          }
        )

      let initialLedgerTransactions: LedgerTransaction.Record[] = []
      await adminTransaction(async ({ transaction }) => {
        initialLedgerTransactions = await selectLedgerTransactions(
          {
            initiatingSourceId: initialEvent!.id,
            initiatingSourceType:
              LedgerTransactionInitiatingSourceType.UsageEvent,
          },
          transaction
        )
      })
      const initialLedgerItemCount =
        initialLedgerTransactions.length > 0
          ? (
              await adminTransaction(async ({ transaction }) =>
                selectLedgerEntries(
                  {
                    ledgerTransactionId:
                      initialLedgerTransactions[0].id,
                  },
                  transaction
                )
              )
            ).length
          : 0

      const { usageEvent: resultEvent } =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: initialEventDetails },
                livemode: true,
              },
              transaction
            )
          }
        )

      expect(resultEvent.id).toBe(initialEvent.id)

      let subsequentLedgerTransactions: LedgerTransaction.Record[] =
        []
      await adminTransaction(async ({ transaction }) => {
        subsequentLedgerTransactions = await selectLedgerTransactions(
          {
            initiatingSourceId: resultEvent!.id,
            initiatingSourceType:
              LedgerTransactionInitiatingSourceType.UsageEvent,
          },
          transaction
        )
      })
      const subsequentLedgerItemCount =
        subsequentLedgerTransactions.length > 0
          ? (
              await adminTransaction(async ({ transaction }) =>
                selectLedgerEntries(
                  {
                    ledgerTransactionId:
                      subsequentLedgerTransactions[0].id,
                  },
                  transaction
                )
              )
            ).length
          : 0
      expect(subsequentLedgerItemCount).toBe(initialLedgerItemCount)
    })

    it('should throw error if transactionId exists for a different subscription', async () => {
      const sharedTransactionId = `txn_shared_${core.nanoid()}`

      const sub2 = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: usagePrice.id,
      })

      const now = new Date()
      const endDate = new Date(now)
      endDate.setDate(now.getDate() + 30)
      await setupBillingPeriod({
        subscriptionId: sub2.id,
        startDate: now,
        endDate: endDate,
      })
      await setupLedgerAccount({
        subscriptionId: sub2.id,
        usageMeterId: usagePrice.usageMeterId!,
        livemode: true,
        organizationId: organization.id,
      })
      await adminTransaction(async ({ transaction }) => {
        return ingestAndProcessUsageEvent(
          {
            input: {
              usageEvent: {
                priceId: usagePrice.id,
                usageMeterId: usagePrice.usageMeterId!,
                subscriptionId: sub2.id,
                transactionId: sharedTransactionId,
                amount: 1,
              },
            },
            livemode: true,
          },
          transaction
        )
      })

      const usageEventDetailsMainSub: CreateUsageEventInput['usageEvent'] =
        {
          priceId: usagePrice.id,
          usageMeterId: usagePrice.usageMeterId!,
          subscriptionId: mainSubscription.id,
          transactionId: sharedTransactionId,
          amount: 1,
        }
      const inputMainSub: CreateUsageEventInput = {
        usageEvent: usageEventDetailsMainSub,
      }

      await expect(
        adminTransaction(async ({ transaction }) => {
          return ingestAndProcessUsageEvent(
            { input: inputMainSub, livemode: true },
            transaction
          )
        })
      ).rejects.toThrow(
        `A usage event already exists for transactionid ${sharedTransactionId}, but does not belong to subscription ${mainSubscription.id}.`
      )
    })

    it('should handle usageEvent.properties (present and absent)', async () => {
      const propsPresentDetails: CreateUsageEventInput['usageEvent'] =
        {
          priceId: usagePrice.id,
          usageMeterId: usagePrice.usageMeterId!,
          subscriptionId: mainSubscription.id,
          transactionId: `txn_props_${core.nanoid()}`,
          amount: 1,
          properties: { test: 'value' },
        }
      const { usageEvent: resultWithProps } =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: propsPresentDetails },
                livemode: true,
              },
              transaction
            )
          }
        )
      expect(resultWithProps.properties).toEqual({
        test: 'value',
      })

      const propsAbsentDetails: CreateUsageEventInput['usageEvent'] =
        {
          priceId: usagePrice.id,
          usageMeterId: usagePrice.usageMeterId!,
          subscriptionId: mainSubscription.id,
          transactionId: `txn_no_props_${core.nanoid()}`,
          amount: 1,
        }
      const { usageEvent: resultWithoutProps } =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: propsAbsentDetails },
                livemode: true,
              },
              transaction
            )
          }
        )
      expect(resultWithoutProps!.properties).toEqual({})
    })

    it('should handle usageEvent.usageDate (timestamp and undefined)', async () => {
      const timestamp = Date.now()
      const datePresentDetails: CreateUsageEventInput['usageEvent'] =
        {
          priceId: usagePrice.id,
          usageMeterId: usagePrice.usageMeterId!,
          subscriptionId: mainSubscription.id,
          transactionId: `txn_date_${core.nanoid()}`,
          amount: 1,
          usageDate: timestamp,
        }
      const { usageEvent: resultWithDate } =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: datePresentDetails },
                livemode: true,
              },
              transaction
            )
          }
        )
      expect(resultWithDate.usageDate!).toBe(timestamp)

      const dateAbsentDetails: CreateUsageEventInput['usageEvent'] = {
        priceId: usagePrice.id,
        usageMeterId: usagePrice.usageMeterId!,
        subscriptionId: mainSubscription.id,
        transactionId: `txn_no_date_${core.nanoid()}`,
        amount: 1,
      }
      const { usageEvent: resultWithoutDate } =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: dateAbsentDetails },
                livemode: true,
              },
              transaction
            )
          }
        )
      expect(resultWithoutDate.usageDate).toBeDefined()
    })

    it('should handle livemode input correctly (true and false)', async () => {
      const liveTrueDetails: CreateUsageEventInput['usageEvent'] = {
        priceId: usagePrice.id,
        usageMeterId: usagePrice.usageMeterId!,
        subscriptionId: mainSubscription.id,
        transactionId: `txn_live_${core.nanoid()}`,
        amount: 1,
      }
      const { usageEvent: resultLiveTrue } =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: liveTrueDetails },
                livemode: true,
              },
              transaction
            )
          }
        )
      expect(resultLiveTrue.livemode).toBe(true)

      const liveTrueTransactions: LedgerTransaction.Record[] =
        await adminTransaction(async ({ transaction }) => {
          return selectLedgerTransactions(
            {
              initiatingSourceId: resultLiveTrue.id,
              initiatingSourceType:
                LedgerTransactionInitiatingSourceType.UsageEvent,
            },
            transaction
          )
        })
      expect(liveTrueTransactions.length).toBe(1)
      const liveTrueLedgerItems: LedgerEntry.Record[] =
        await adminTransaction(async ({ transaction }) => {
          return selectLedgerEntries(
            { ledgerTransactionId: liveTrueTransactions[0].id },
            transaction
          )
        })
      expect(liveTrueLedgerItems[0].livemode).toBe(true)
      const testmodeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: usagePrice.id,
      })
      await setupLedgerAccount({
        subscriptionId: testmodeSubscription.id,
        usageMeterId: usagePrice.usageMeterId!,
        livemode: false,
        organizationId: organization.id,
      })
      await setupBillingPeriod({
        subscriptionId: testmodeSubscription.id,
        startDate: Date.now(),
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        livemode: false,
      })
      const liveFalseDetails: CreateUsageEventInput['usageEvent'] = {
        priceId: usagePrice.id,
        usageMeterId: usagePrice.usageMeterId!,
        subscriptionId: testmodeSubscription.id,
        transactionId: `txn_test_${core.nanoid()}`,
        amount: 1,
      }
      const { usageEvent: resultLiveFalse } =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: liveFalseDetails },
                livemode: false,
              },
              transaction
            )
          }
        )
      expect(resultLiveFalse.livemode).toBe(false)

      const liveFalseTransactions: LedgerTransaction.Record[] =
        await adminTransaction(async ({ transaction }) => {
          return selectLedgerTransactions(
            {
              initiatingSourceId: resultLiveFalse!.id,
              initiatingSourceType:
                LedgerTransactionInitiatingSourceType.UsageEvent,
            },
            transaction
          )
        })
      expect(liveFalseTransactions.length).toBe(1)
      const liveFalseLedgerItems: LedgerEntry.Record[] =
        await adminTransaction(async ({ transaction }) => {
          return selectLedgerEntries(
            { ledgerTransactionId: liveFalseTransactions[0].id },
            transaction
          )
        })
      expect(liveFalseLedgerItems[0].livemode).toBe(false)
    })

    it('should handle usage meter of type "count_distinct_properties" correctly', async () => {
      // Setup a usage meter with count_distinct_properties aggregation
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Distinct Properties Usage Meter',
        livemode: true,
        aggregationType:
          UsageMeterAggregationType.CountDistinctProperties,
      })

      // Setup price with this usage meter
      const distinctPrice = await setupPrice({
        productId: (
          await adminTransaction(async ({ transaction }) => {
            const orgSetup = await setupOrg()
            return orgSetup.product
          })
        ).id,
        name: 'Distinct Properties Price',
        type: PriceType.Usage,
        unitPrice: 10,
        intervalUnit: IntervalUnit.Day,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
        usageMeterId: usageMeter.id,
      })

      // Setup subscription
      const distinctSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: distinctPrice.id,
      })

      // Setup billing period
      const now = new Date()
      const endDate = new Date(now)
      endDate.setDate(now.getDate() + 30)
      const distinctBillingPeriod = await setupBillingPeriod({
        subscriptionId: distinctSubscription.id,
        startDate: now,
        endDate: endDate,
      })

      // Setup ledger account
      await setupLedgerAccount({
        subscriptionId: distinctSubscription.id,
        usageMeterId: usageMeter.id,
        livemode: true,
        organizationId: organization.id,
      })

      const testProperties = {
        user_id: 'user_123',
        feature: 'export',
      }

      // Test 1: First event with unique properties should emit ledger command
      const firstEventDetails: CreateUsageEventInput['usageEvent'] = {
        priceId: distinctPrice.id,
        usageMeterId: distinctPrice.usageMeterId!,
        subscriptionId: distinctSubscription.id,
        transactionId: `txn_distinct_1_${core.nanoid()}`,
        amount: 1,
        properties: testProperties,
      }

      const beforeFirstEvent = Date.now()
      const { usageEvent: firstUsageEvent } =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: firstEventDetails },
                livemode: true,
              },
              transaction
            )
          }
        )

      // Verify first usage event was inserted with correct properties
      expect(firstUsageEvent).toBeDefined()
      expect(firstUsageEvent.properties).toEqual(testProperties)
      expect(firstUsageEvent.billingPeriodId).toBe(
        distinctBillingPeriod.id
      )
      expect(firstUsageEvent.usageMeterId).toBe(usageMeter.id)

      // Verify usageDate
      const firstEventTime = firstUsageEvent.usageDate!
      expect(firstEventTime).toBeGreaterThanOrEqual(beforeFirstEvent)
      expect(firstEventTime).toBeLessThanOrEqual(Date.now())

      // Verify ledger command was emitted (ledger transaction created)
      const firstLedgerTransactions = await adminTransaction(
        async ({ transaction }) => {
          return selectLedgerTransactions(
            {
              initiatingSourceId: firstUsageEvent.id,
              initiatingSourceType:
                LedgerTransactionInitiatingSourceType.UsageEvent,
            },
            transaction
          )
        }
      )
      expect(firstLedgerTransactions.length).toBe(1)

      // Test 2: Second event with same properties should NOT emit ledger command
      const secondEventDetails: CreateUsageEventInput['usageEvent'] =
        {
          priceId: distinctPrice.id,
          usageMeterId: distinctPrice.usageMeterId!,
          subscriptionId: distinctSubscription.id,
          transactionId: `txn_distinct_2_${core.nanoid()}`,
          amount: 1,
          properties: testProperties, // Same properties as first event
        }

      const beforeSecondEvent = Date.now()
      const { usageEvent: secondUsageEvent } =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: secondEventDetails },
                livemode: true,
              },
              transaction
            )
          }
        )

      // Verify second usage event was inserted with correct properties
      expect(secondUsageEvent).toBeDefined()
      expect(secondUsageEvent.properties).toEqual(testProperties)
      expect(secondUsageEvent.billingPeriodId).toBe(
        distinctBillingPeriod.id
      )
      expect(secondUsageEvent.usageMeterId).toBe(usageMeter.id)

      // Verify usageDate
      const secondEventTime = secondUsageEvent.usageDate!
      expect(secondEventTime).toBeGreaterThanOrEqual(
        beforeSecondEvent
      )
      expect(secondEventTime).toBeLessThanOrEqual(Date.now())

      // Verify NO ledger command was emitted (no new ledger transaction)
      const secondLedgerTransactions = await adminTransaction(
        async ({ transaction }) => {
          return selectLedgerTransactions(
            {
              initiatingSourceId: secondUsageEvent.id,
              initiatingSourceType:
                LedgerTransactionInitiatingSourceType.UsageEvent,
            },
            transaction
          )
        }
      )
      expect(secondLedgerTransactions.length).toBe(0)

      // Verify the two events are different records
      expect(firstUsageEvent.id).not.toBe(secondUsageEvent.id)

      // Test 3: Third event with different properties should emit ledger command
      const thirdEventDetails: CreateUsageEventInput['usageEvent'] = {
        priceId: distinctPrice.id,
        usageMeterId: distinctPrice.usageMeterId!,
        subscriptionId: distinctSubscription.id,
        transactionId: `txn_distinct_3_${core.nanoid()}`,
        amount: 1,
        properties: { ...testProperties, feature: 'import' },
      }
      const { usageEvent: thirdUsageEvent } =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: thirdEventDetails },
                livemode: true,
              },
              transaction
            )
          }
        )
      expect(thirdUsageEvent).toBeDefined()
      expect(thirdUsageEvent.properties).toEqual({
        ...testProperties,
        feature: 'import',
      })
      expect(thirdUsageEvent.billingPeriodId).toBe(
        distinctBillingPeriod.id
      )
      expect(thirdUsageEvent.usageMeterId).toBe(usageMeter.id)
      expect(thirdUsageEvent.usageDate).toBeDefined()

      // Verify ledger command was emitted (ledger transaction created)
      const thirdLedgerTransactions = await adminTransaction(
        async ({ transaction }) => {
          return selectLedgerTransactions(
            {
              initiatingSourceId: thirdUsageEvent.id,
              initiatingSourceType:
                LedgerTransactionInitiatingSourceType.UsageEvent,
            },
            transaction
          )
        }
      )
      expect(thirdLedgerTransactions.length).toBe(1)
    })

    it('should throw error when usageMeterId from different pricing model is provided directly', async () => {
      // Create a usage meter in a different organization
      const otherOrgUsageMeter = await adminTransaction(
        async ({ transaction }) => {
          const orgSetup = await setupOrg()
          const testUsageMeter = await setupUsageMeter({
            organizationId: orgSetup.organization.id,
            name: 'Other Org Usage Meter',
            livemode: true,
            pricingModelId: orgSetup.pricingModel.id,
          })
          return testUsageMeter
        }
      )

      const input: CreateUsageEventInput = {
        usageEvent: {
          subscriptionId: mainSubscription.id, // Belongs to original org
          usageMeterId: otherOrgUsageMeter.id, // Belongs to different org
          priceId: null, // No priceId when usageMeterId is provided directly
          amount: 100,
          transactionId: `txn_wrong_pricing_model_${core.nanoid()}`,
        },
      }

      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) => {
          return ingestAndProcessUsageEvent(
            { input, livemode: true },
            transaction
          )
        })
      ).rejects.toThrow(
        `Usage meter ${otherOrgUsageMeter.id} not found for this customer's pricing model`
      )
    })

    it('should successfully create usage event when priceId is null and valid usageMeterId is provided directly', async () => {
      const input: CreateUsageEventInput = {
        usageEvent: {
          subscriptionId: mainSubscription.id,
          usageMeterId: usageMeter.id, // Valid usage meter from customer's pricing model
          priceId: null, // No priceId when usageMeterId is provided directly
          amount: 100,
          transactionId: `txn_direct_usage_meter_${core.nanoid()}`,
          properties: { test_property: 'direct_usage_meter_test' },
        },
      }

      const { usageEvent: createdUsageEvent } =
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            return ingestAndProcessUsageEvent(
              { input, livemode: true },
              transaction
            )
          }
        )

      expect(createdUsageEvent.priceId).toBeNull()
      expect(createdUsageEvent.usageMeterId).toBe(usageMeter.id)
      expect(createdUsageEvent.subscriptionId).toBe(
        mainSubscription.id
      )
      expect(createdUsageEvent.customerId).toBe(customer.id)
      expect(createdUsageEvent.amount).toBe(100)
      expect(createdUsageEvent.billingPeriodId).toBe(
        mainBillingPeriod.id
      )
      expect(createdUsageEvent.livemode).toBe(true)
      expect(createdUsageEvent.properties).toEqual({
        test_property: 'direct_usage_meter_test',
      })
      expect(createdUsageEvent.transactionId).toBe(
        input.usageEvent.transactionId
      )
    })
  })

  describe('createUsageEventWithSlugSchema', () => {
    const baseValidInput = {
      subscriptionId: 'sub-123',
      amount: 100,
      transactionId: 'txn-123',
    }

    describe('valid inputs', () => {
      it('should accept priceId only', () => {
        const result = createUsageEventWithSlugSchema.parse({
          usageEvent: {
            ...baseValidInput,
            priceId: 'price-123',
          },
        })
        expect(result.usageEvent.priceId).toBe('price-123')
        expect(result.usageEvent.priceSlug).toBeUndefined()
        expect(result.usageEvent.usageMeterId).toBeUndefined()
        expect(result.usageEvent.usageMeterSlug).toBeUndefined()
      })

      it('should accept priceSlug only', () => {
        const result = createUsageEventWithSlugSchema.parse({
          usageEvent: {
            ...baseValidInput,
            priceSlug: 'price-slug-123',
          },
        })
        expect(result.usageEvent.priceSlug).toBe('price-slug-123')
        expect(result.usageEvent.priceId).toBeUndefined()
        expect(result.usageEvent.usageMeterId).toBeUndefined()
        expect(result.usageEvent.usageMeterSlug).toBeUndefined()
      })

      it('should accept usageMeterId only', () => {
        const result = createUsageEventWithSlugSchema.parse({
          usageEvent: {
            ...baseValidInput,
            usageMeterId: 'usage-meter-123',
          },
        })
        expect(result.usageEvent.usageMeterId).toBe('usage-meter-123')
        expect(result.usageEvent.priceId).toBeUndefined()
        expect(result.usageEvent.priceSlug).toBeUndefined()
        expect(result.usageEvent.usageMeterSlug).toBeUndefined()
      })

      it('should accept usageMeterSlug only', () => {
        const result = createUsageEventWithSlugSchema.parse({
          usageEvent: {
            ...baseValidInput,
            usageMeterSlug: 'usage-meter-slug-123',
          },
        })
        expect(result.usageEvent.usageMeterSlug).toBe(
          'usage-meter-slug-123'
        )
        expect(result.usageEvent.priceId).toBeUndefined()
        expect(result.usageEvent.priceSlug).toBeUndefined()
        expect(result.usageEvent.usageMeterId).toBeUndefined()
      })
    })

    describe('invalid inputs - mutual exclusivity', () => {
      it('should reject when both priceId and priceSlug are provided', () => {
        expect(() => {
          createUsageEventWithSlugSchema.parse({
            usageEvent: {
              ...baseValidInput,
              priceId: 'price-123',
              priceSlug: 'price-slug-123',
            },
          })
        }).toThrow(
          'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
        )
      })

      it('should reject when both priceId and usageMeterId are provided', () => {
        expect(() => {
          createUsageEventWithSlugSchema.parse({
            usageEvent: {
              ...baseValidInput,
              priceId: 'price-123',
              usageMeterId: 'usage-meter-123',
            },
          })
        }).toThrow(
          'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
        )
      })

      it('should reject when both priceSlug and usageMeterSlug are provided', () => {
        expect(() => {
          createUsageEventWithSlugSchema.parse({
            usageEvent: {
              ...baseValidInput,
              priceSlug: 'price-slug-123',
              usageMeterSlug: 'usage-meter-slug-123',
            },
          })
        }).toThrow(
          'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
        )
      })

      it('should reject when priceId and usageMeterSlug are provided', () => {
        expect(() => {
          createUsageEventWithSlugSchema.parse({
            usageEvent: {
              ...baseValidInput,
              priceId: 'price-123',
              usageMeterSlug: 'usage-meter-slug-123',
            },
          })
        }).toThrow(
          'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
        )
      })

      it('should reject when priceSlug and usageMeterId are provided', () => {
        expect(() => {
          createUsageEventWithSlugSchema.parse({
            usageEvent: {
              ...baseValidInput,
              priceSlug: 'price-slug-123',
              usageMeterId: 'usage-meter-123',
            },
          })
        }).toThrow(
          'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
        )
      })

      it('should reject when all four identifiers are provided', () => {
        expect(() => {
          createUsageEventWithSlugSchema.parse({
            usageEvent: {
              ...baseValidInput,
              priceId: 'price-123',
              priceSlug: 'price-slug-123',
              usageMeterId: 'usage-meter-123',
              usageMeterSlug: 'usage-meter-slug-123',
            },
          })
        }).toThrow(
          'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
        )
      })

      it('should reject when neither priceId nor priceSlug is provided', () => {
        expect(() => {
          createUsageEventWithSlugSchema.parse({
            usageEvent: {
              ...baseValidInput,
            },
          })
        }).toThrow(
          'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
        )
      })
    })
  })

  describe('resolveUsageEventInput', () => {
    it('should return input with priceId when priceId is provided', async () => {
      const input = {
        usageEvent: {
          subscriptionId: mainSubscription.id,
          priceId: usagePrice.id,
          amount: 100,
          transactionId: `txn_resolve_${core.nanoid()}`,
        },
      }

      const result = await adminTransaction(
        async ({ transaction }) => {
          return resolveUsageEventInput(input, transaction)
        }
      )

      expect(result.usageEvent.priceId).toBe(usagePrice.id)
      expect(result.usageEvent).not.toHaveProperty('priceSlug')
    })

    it('should resolve priceSlug to priceId when priceSlug is provided', async () => {
      // First, we need to set up a price with a slug
      const priceWithSlug = await adminTransaction(
        async ({ transaction }) => {
          const orgSetup = await setupOrg()
          const testCustomer = await setupCustomer({
            organizationId: orgSetup.organization.id,
          })
          const testPaymentMethod = await setupPaymentMethod({
            organizationId: orgSetup.organization.id,
            customerId: testCustomer.id,
          })
          const testUsageMeter = await setupUsageMeter({
            organizationId: orgSetup.organization.id,
            name: 'Test Usage Meter with Slug',
            livemode: true,
            pricingModelId: orgSetup.pricingModel.id,
          })
          const testPrice = await setupPrice({
            productId: orgSetup.product.id,
            name: 'Test Usage Price with Slug',
            type: PriceType.Usage,
            unitPrice: 10,
            intervalUnit: IntervalUnit.Day,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            currency: CurrencyCode.USD,
            usageMeterId: testUsageMeter.id,
            slug: 'test-usage-price-slug',
          })
          const testSubscription = await setupSubscription({
            organizationId: orgSetup.organization.id,
            customerId: testCustomer.id,
            paymentMethodId: testPaymentMethod.id,
            priceId: testPrice.id,
          })
          return { testPrice, testSubscription, testCustomer }
        }
      )

      const input = {
        usageEvent: {
          subscriptionId: priceWithSlug.testSubscription.id,
          priceSlug: 'test-usage-price-slug',
          amount: 100,
          transactionId: `txn_resolve_slug_${core.nanoid()}`,
        },
      }

      const result = await adminTransaction(
        async ({ transaction }) => {
          return resolveUsageEventInput(input, transaction)
        }
      )

      expect(result.usageEvent.priceId).toBe(
        priceWithSlug.testPrice.id
      )
      expect(result.usageEvent).not.toHaveProperty('priceSlug')
    })

    it('should throw NOT_FOUND error when priceSlug does not exist or belongs to different pricing model', async () => {
      const inputNonExistent = {
        usageEvent: {
          subscriptionId: mainSubscription.id,
          priceSlug: 'non-existent-slug',
          amount: 100,
          transactionId: `txn_not_found_${core.nanoid()}`,
        },
      }

      await expect(
        adminTransaction(async ({ transaction }) => {
          return resolveUsageEventInput(inputNonExistent, transaction)
        })
      ).rejects.toThrow(
        "Price with slug non-existent-slug not found for this customer's pricing model"
      )

      // Set up a second pricing model in the same organization with a price with a slug
      await adminTransaction(async ({ transaction }) => {
        // Create a second pricing model in the same organization
        const secondPricingModel = await setupPricingModel({
          organizationId: organization.id,
          name: 'Second Pricing Model',
          livemode: true,
          isDefault: false,
        })

        // Create a product in the second pricing model
        const secondProduct = await setupProduct({
          organizationId: organization.id,
          pricingModelId: secondPricingModel.id,
          name: 'Second Product',
          livemode: true,
          active: true,
        })

        const secondUsageMeter = await setupUsageMeter({
          organizationId: organization.id,
          name: 'Second Usage Meter',
          livemode: true,
          pricingModelId: secondPricingModel.id,
        })

        // Create a price with a slug in the second pricing model
        await setupPrice({
          productId: secondProduct.id,
          name: 'Second Usage Price',
          type: PriceType.Usage,
          unitPrice: 20,
          intervalUnit: IntervalUnit.Day,
          intervalCount: 1,
          livemode: true,
          isDefault: false,
          currency: CurrencyCode.USD,
          usageMeterId: secondUsageMeter.id,
          slug: 'other-pricing-model-price-slug',
        })
      })

      // Try to use the slug from second pricing model's price with first customer's subscription
      // This should fail because the slug belongs to a different pricing model
      const inputDifferentPricingModel = {
        usageEvent: {
          subscriptionId: mainSubscription.id, // First customer's subscription (default pricing model)
          priceSlug: 'other-pricing-model-price-slug', // Slug from second pricing model's price
          amount: 100,
          transactionId: `txn_cross_pricing_model_${core.nanoid()}`,
        },
      }

      // Should fail because the slug belongs to a different pricing model
      await expect(
        adminTransaction(async ({ transaction }) => {
          return resolveUsageEventInput(
            inputDifferentPricingModel,
            transaction
          )
        })
      ).rejects.toThrow(
        "Price with slug other-pricing-model-price-slug not found for this customer's pricing model"
      )
    })

    it('should throw BAD_REQUEST error when neither priceId nor priceSlug is provided', async () => {
      const inputWithoutPrice = {
        usageEvent: {
          subscriptionId: mainSubscription.id,
          amount: 100,
          transactionId: `txn_no_price_${core.nanoid()}`,
        },
      }

      await expect(
        adminTransaction(async ({ transaction }) => {
          return resolveUsageEventInput(
            inputWithoutPrice,
            transaction
          )
        })
      ).rejects.toThrow(
        'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
      )
    })

    it('should resolve usageMeterId to usage event with null priceId', async () => {
      const input = {
        usageEvent: {
          subscriptionId: mainSubscription.id,
          usageMeterId: usageMeter.id,
          amount: 100,
          transactionId: `txn_resolve_um_id_${core.nanoid()}`,
        },
      }

      const result = await adminTransaction(
        async ({ transaction }) => {
          return resolveUsageEventInput(input, transaction)
        }
      )

      expect(result.usageEvent.usageMeterId).toBe(usageMeter.id)
      expect(result.usageEvent.priceId).toBeNull()
      expect(result.usageEvent).not.toHaveProperty('usageMeterSlug')
    })

    it('should resolve usageMeterSlug to usageMeterId with null priceId', async () => {
      // First, we need to set up a usage meter with a slug
      const usageMeterWithSlug = await adminTransaction(
        async ({ transaction }) => {
          const orgSetup = await setupOrg()
          const testCustomer = await setupCustomer({
            organizationId: orgSetup.organization.id,
            pricingModelId: orgSetup.pricingModel.id,
          })
          const testPaymentMethod = await setupPaymentMethod({
            organizationId: orgSetup.organization.id,
            customerId: testCustomer.id,
          })
          const testUsageMeter = await setupUsageMeter({
            organizationId: orgSetup.organization.id,
            name: 'Test Usage Meter with Slug',
            livemode: true,
            pricingModelId: orgSetup.pricingModel.id,
            slug: 'test-usage-meter-slug',
          })
          const testPrice = await setupPrice({
            productId: orgSetup.product.id,
            name: 'Test Usage Price',
            type: PriceType.Usage,
            unitPrice: 10,
            intervalUnit: IntervalUnit.Day,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            currency: CurrencyCode.USD,
            usageMeterId: testUsageMeter.id,
          })
          const testSubscription = await setupSubscription({
            organizationId: orgSetup.organization.id,
            customerId: testCustomer.id,
            paymentMethodId: testPaymentMethod.id,
            priceId: testPrice.id,
          })
          return { testUsageMeter, testSubscription, testCustomer }
        }
      )

      const input = {
        usageEvent: {
          subscriptionId: usageMeterWithSlug.testSubscription.id,
          usageMeterSlug: 'test-usage-meter-slug',
          amount: 100,
          transactionId: `txn_resolve_um_slug_${core.nanoid()}`,
        },
      }

      const result = await adminTransaction(
        async ({ transaction }) => {
          return resolveUsageEventInput(input, transaction)
        }
      )

      expect(result.usageEvent.usageMeterId).toBe(
        usageMeterWithSlug.testUsageMeter.id
      )
      expect(result.usageEvent.priceId).toBeNull()
      expect(result.usageEvent).not.toHaveProperty('usageMeterSlug')
    })

    it('should throw NOT_FOUND error when usageMeterId does not exist in customer pricing model', async () => {
      // Create a usage meter in a different organization
      const otherOrgUsageMeter = await adminTransaction(
        async ({ transaction }) => {
          const orgSetup = await setupOrg()
          const testUsageMeter = await setupUsageMeter({
            organizationId: orgSetup.organization.id,
            name: 'Other Org Usage Meter',
            livemode: true,
            pricingModelId: orgSetup.pricingModel.id,
          })
          return testUsageMeter
        }
      )

      const input = {
        usageEvent: {
          subscriptionId: mainSubscription.id, // Belongs to original org
          usageMeterId: otherOrgUsageMeter.id, // Belongs to different org
          amount: 100,
          transactionId: `txn_wrong_org_um_${core.nanoid()}`,
        },
      }

      await expect(
        adminTransaction(async ({ transaction }) => {
          return resolveUsageEventInput(input, transaction)
        })
      ).rejects.toThrow(
        `Usage meter ${otherOrgUsageMeter.id} not found for this customer's pricing model`
      )
    })

    it('should throw NOT_FOUND error when usageMeterSlug does not exist', async () => {
      const input = {
        usageEvent: {
          subscriptionId: mainSubscription.id,
          usageMeterSlug: 'non-existent-usage-meter-slug',
          amount: 100,
          transactionId: `txn_not_found_um_slug_${core.nanoid()}`,
        },
      }

      await expect(
        adminTransaction(async ({ transaction }) => {
          return resolveUsageEventInput(input, transaction)
        })
      ).rejects.toThrow(
        "Usage meter with slug non-existent-usage-meter-slug not found for this customer's pricing model"
      )
    })
  })

  async function setupCountDistinctPropertiesMeter({
    organizationId,
    customerId,
    paymentMethodId,
    pricingModelId,
    productId,
  }: {
    organizationId: string
    customerId: string
    paymentMethodId: string
    pricingModelId: string
    productId: string
  }) {
    const distinctMeter = await setupUsageMeter({
      organizationId,
      name: 'Distinct Properties Meter',
      livemode: true,
      pricingModelId,
      aggregationType:
        UsageMeterAggregationType.CountDistinctProperties,
    })

    const distinctPrice = await setupPrice({
      productId,
      name: 'Distinct Price',
      type: PriceType.Usage,
      unitPrice: 10,
      intervalUnit: IntervalUnit.Day,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
      usageMeterId: distinctMeter.id,
    })

    const distinctSubscription = await setupSubscription({
      organizationId,
      customerId,
      paymentMethodId,
      priceId: distinctPrice.id,
    })

    const now = new Date()
    const endDate = new Date(now)
    endDate.setDate(now.getDate() + 30)
    const distinctBillingPeriod = await setupBillingPeriod({
      subscriptionId: distinctSubscription.id,
      startDate: now,
      endDate: endDate,
    })

    return {
      distinctMeter,
      distinctPrice,
      distinctSubscription,
      distinctBillingPeriod,
    }
  }

  describe('shouldProcessUsageEventLedgerCommand', () => {
    it('should return true for non-CountDistinctProperties meter', async () => {
      await adminTransaction(async ({ transaction }) => {
        const usageEvent = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: mainSubscription.id,
          usageMeterId: usageMeter.id,
          customerId: customer.id,
          amount: 10,
          transactionId: `txn_${core.nanoid()}`,
          priceId: usagePrice.id,
        })

        const shouldProcess =
          await shouldProcessUsageEventLedgerCommand(
            {
              usageEvent,
              usageMeterAggregationType:
                UsageMeterAggregationType.Sum,
              billingPeriod: mainBillingPeriod,
            },
            transaction
          )

        expect(shouldProcess).toBe(true)
      })
    })

    it('should return true for unique properties and false for duplicate properties in same billing period for CountDistinctProperties meter', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Setup CountDistinctProperties meter using existing org setup
        const {
          distinctMeter,
          distinctPrice,
          distinctSubscription,
          distinctBillingPeriod,
        } = await setupCountDistinctPropertiesMeter({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          pricingModelId: orgSetup.pricingModel.id,
          productId: orgSetup.product.id,
        })

        const testProperties = {
          user_id: 'user_123',
          feature: 'export',
        }

        // Test 1: Create usage event with unique properties - should return true
        const uniqueEvent = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: distinctSubscription.id,
          usageMeterId: distinctMeter.id,
          customerId: customer.id,
          amount: 1,
          transactionId: `txn_${core.nanoid()}`,
          priceId: distinctPrice.id,
          properties: testProperties,
          billingPeriodId: distinctBillingPeriod.id,
        })

        const shouldProcessUnique =
          await shouldProcessUsageEventLedgerCommand(
            {
              usageEvent: uniqueEvent,
              usageMeterAggregationType:
                UsageMeterAggregationType.CountDistinctProperties,
              billingPeriod: distinctBillingPeriod,
            },
            transaction
          )

        expect(shouldProcessUnique).toBe(true)

        // Test 2: Create second usage event with same properties - should return false
        const duplicateEvent = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: distinctSubscription.id,
          usageMeterId: distinctMeter.id,
          customerId: customer.id,
          amount: 1,
          transactionId: `txn_${core.nanoid()}`,
          priceId: distinctPrice.id,
          properties: testProperties,
          billingPeriodId: distinctBillingPeriod.id,
        })

        const shouldProcessDuplicate =
          await shouldProcessUsageEventLedgerCommand(
            {
              usageEvent: duplicateEvent,
              usageMeterAggregationType:
                UsageMeterAggregationType.CountDistinctProperties,
              billingPeriod: distinctBillingPeriod,
            },
            transaction
          )

        expect(shouldProcessDuplicate).toBe(false)
      })
    })

    it('should throw error when CountDistinctProperties meter has no billing period', async () => {
      await adminTransaction(async ({ transaction }) => {
        const usageEvent = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: mainSubscription.id,
          usageMeterId: usageMeter.id,
          customerId: customer.id,
          amount: 10,
          transactionId: `txn_${core.nanoid()}`,
          priceId: usagePrice.id,
        })

        await expect(
          shouldProcessUsageEventLedgerCommand(
            {
              usageEvent,
              usageMeterAggregationType:
                UsageMeterAggregationType.CountDistinctProperties,
              billingPeriod: null,
            },
            transaction
          )
        ).rejects.toThrow(
          'Billing period is required for usage meter of type "count_distinct_properties".'
        )
      })
    })
  })

  describe('generateLedgerCommandsForBulkUsageEvents', () => {
    it('should generate ledger commands for all inserted events when none are duplicates and include organizationId and subscriptionId from subscription lookup', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create 3 usage events with different transactionIds
        const event1 = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: mainSubscription.id,
          usageMeterId: usageMeter.id,
          customerId: customer.id,
          amount: 10,
          transactionId: `txn_${core.nanoid()}`,
          priceId: usagePrice.id,
        })

        const event2 = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: mainSubscription.id,
          usageMeterId: usageMeter.id,
          customerId: customer.id,
          amount: 20,
          transactionId: `txn_${core.nanoid()}`,
          priceId: usagePrice.id,
        })

        const event3 = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: mainSubscription.id,
          usageMeterId: usageMeter.id,
          customerId: customer.id,
          amount: 30,
          transactionId: `txn_${core.nanoid()}`,
          priceId: usagePrice.id,
        })

        const ledgerCommands =
          await generateLedgerCommandsForBulkUsageEvents(
            {
              insertedUsageEvents: [event1, event2, event3],
              livemode: true,
            },
            transaction
          )

        expect(ledgerCommands.length).toBe(3)
        expect(ledgerCommands[0].type).toBe(
          LedgerTransactionType.UsageEventProcessed
        )
        expect(ledgerCommands[0].livemode).toBe(true)
        expect(ledgerCommands[0].organizationId).toBe(organization.id)
        expect(ledgerCommands[0].subscriptionId).toBe(
          mainSubscription.id
        )
        expect(ledgerCommands[0].payload.usageEvent.id).toBe(
          event1.id
        )
        expect(ledgerCommands[1].payload.usageEvent.id).toBe(
          event2.id
        )
        expect(ledgerCommands[2].payload.usageEvent.id).toBe(
          event3.id
        )
      })
    })

    it('should skip ledger commands for CountDistinctProperties duplicates in same period, including when properties key order differs', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Setup CountDistinctProperties meter using existing org setup
        const {
          distinctMeter,
          distinctPrice,
          distinctSubscription,
          distinctBillingPeriod,
        } = await setupCountDistinctPropertiesMeter({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          pricingModelId: orgSetup.pricingModel.id,
          productId: orgSetup.product.id,
        })

        const testProperties = {
          user_id: 'user_123',
          feature: 'export',
        }

        // Test 1: Create first event with unique properties
        const event1 = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: distinctSubscription.id,
          usageMeterId: distinctMeter.id,
          customerId: customer.id,
          amount: 1,
          transactionId: `txn_${core.nanoid()}`,
          priceId: distinctPrice.id,
          properties: testProperties,
          billingPeriodId: distinctBillingPeriod.id,
        })

        // Test 1: Create second event with same properties (duplicate)
        const event2 = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: distinctSubscription.id,
          usageMeterId: distinctMeter.id,
          customerId: customer.id,
          amount: 1,
          transactionId: `txn_${core.nanoid()}`,
          priceId: distinctPrice.id,
          properties: testProperties,
          billingPeriodId: distinctBillingPeriod.id,
        })

        const ledgerCommands1 =
          await generateLedgerCommandsForBulkUsageEvents(
            {
              insertedUsageEvents: [event1, event2],
              livemode: true,
            },
            transaction
          )

        // Should only generate command for first event (second is duplicate)
        expect(ledgerCommands1.length).toBe(1)
        expect(ledgerCommands1[0].payload.usageEvent.id).toBe(
          event1.id
        )

        // Test 2: Test deduplication with different key order
        const propsA = {
          user_id: 'user_456',
          feature: 'import',
        }
        const propsB = {
          feature: 'import',
          user_id: 'user_456',
        }

        const event3 = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: distinctSubscription.id,
          usageMeterId: distinctMeter.id,
          customerId: customer.id,
          amount: 1,
          transactionId: `txn_${core.nanoid()}`,
          priceId: distinctPrice.id,
          properties: propsA,
          billingPeriodId: distinctBillingPeriod.id,
        })

        const event4 = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: distinctSubscription.id,
          usageMeterId: distinctMeter.id,
          customerId: customer.id,
          amount: 1,
          transactionId: `txn_${core.nanoid()}`,
          priceId: distinctPrice.id,
          properties: propsB,
          billingPeriodId: distinctBillingPeriod.id,
        })

        const ledgerCommands2 =
          await generateLedgerCommandsForBulkUsageEvents(
            {
              insertedUsageEvents: [event3, event4],
              livemode: true,
            },
            transaction
          )

        // Should only generate command for first event (second is duplicate even with different key order)
        expect(ledgerCommands2.length).toBe(1)
        expect(ledgerCommands2[0].payload.usageEvent.id).toBe(
          event3.id
        )
      })
    })

    it('should return empty array when no events provided', async () => {
      await adminTransaction(async ({ transaction }) => {
        const ledgerCommands =
          await generateLedgerCommandsForBulkUsageEvents(
            {
              insertedUsageEvents: [],
              livemode: true,
            },
            transaction
          )

        expect(ledgerCommands.length).toBe(0)
      })
    })

    it('should throw error when subscription or usage meter not found', async () => {
      await adminTransaction(async ({ transaction }) => {
        const usageEvent = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: mainSubscription.id,
          usageMeterId: usageMeter.id,
          customerId: customer.id,
          amount: 10,
          transactionId: `txn_${core.nanoid()}`,
          priceId: usagePrice.id,
        })

        // Test 1: Invalid subscriptionId
        const invalidSubscriptionEvent = {
          ...usageEvent,
          subscriptionId: 'non-existent-subscription-id',
        }

        await expect(
          generateLedgerCommandsForBulkUsageEvents(
            {
              insertedUsageEvents: [invalidSubscriptionEvent],
              livemode: true,
            },
            transaction
          )
        ).rejects.toThrow(
          'Subscription non-existent-subscription-id not found'
        )

        // Test 2: Invalid usageMeterId
        const invalidMeterEvent = {
          ...usageEvent,
          usageMeterId: 'non-existent-usage-meter-id',
        }

        await expect(
          generateLedgerCommandsForBulkUsageEvents(
            {
              insertedUsageEvents: [invalidMeterEvent],
              livemode: true,
            },
            transaction
          )
        ).rejects.toThrow(
          'Usage meter non-existent-usage-meter-id not found'
        )
      })
    })
  })
})
