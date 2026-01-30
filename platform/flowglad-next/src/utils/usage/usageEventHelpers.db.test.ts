import { beforeEach, describe, expect, it } from 'bun:test'
import {
  CurrencyCode,
  IntervalUnit,
  LedgerTransactionType,
  PriceType,
  UsageMeterAggregationType,
} from '@db-core/enums'
import type { BillingPeriod } from '@db-core/schema/billingPeriods'
import type { Customer } from '@db-core/schema/customers'
import type { LedgerEntry } from '@db-core/schema/ledgerEntries'
import type { LedgerTransaction } from '@db-core/schema/ledgerTransactions'
import type { Organization } from '@db-core/schema/organizations'
import type { PaymentMethod } from '@db-core/schema/paymentMethods'
import type { Price } from '@db-core/schema/prices'
import type { Subscription } from '@db-core/schema/subscriptions'
import type { CreateUsageEventInput } from '@db-core/schema/usageEvents'
import type { UsageMeter } from '@db-core/schema/usageMeters'
import { Result } from 'better-result'
import * as core from 'nanoid'
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
  adminTransactionWithResult,
  comprehensiveAdminTransactionWithResult,
} from '@/db/adminTransaction'
import { selectLedgerEntries } from '@/db/tableMethods/ledgerEntryMethods'
import { selectLedgerTransactions } from '@/db/tableMethods/ledgerTransactionMethods'
import { createDiscardingEffectsContext } from '@/test-utils/transactionCallbacks'
import { LedgerTransactionInitiatingSourceType } from '@/types'
// Function to test
import {
  createUsageEventWithSlugSchema,
  generateLedgerCommandsForBulkUsageEvents,
  ingestAndProcessUsageEvent,
  resolveUsageEventInput,
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
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
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
        return Result.ok(undefined)
      })
    ).unwrap()
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
          async ({
            transaction,
            emitEvent,
            invalidateCache,
            enqueueLedgerCommand,
            cacheRecomputationContext,
          }) => {
            return ingestAndProcessUsageEvent(
              { input, livemode: true },
              {
                transaction,
                cacheRecomputationContext,
                emitEvent,
                invalidateCache,
                enqueueLedgerCommand,
              }
            )
          }
        )

      if (!createdUsageEvent)
        throw new Error(
          'Test setup failed: createdUsageEvent is null'
        )

      expect(createdUsageEvent.usageMeterId).toBe(
        usagePrice.usageMeterId!
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
      ).toEqual(usageEventDetails.usageDate!)

      let ledgerTransactions: LedgerTransaction.Record[] = [](
        await adminTransactionWithResult(async ({ transaction }) => {
          ledgerTransactions = await selectLedgerTransactions(
            {
              initiatingSourceId: createdUsageEvent!.id,
              initiatingSourceType:
                LedgerTransactionInitiatingSourceType.UsageEvent,
            },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()
      expect(ledgerTransactions.length).toBe(1)
      const ledgerTransactionId = ledgerTransactions[0].id

      let ledgerItems: LedgerEntry.Record[] = [](
        await adminTransactionWithResult(async ({ transaction }) => {
          ledgerItems = await selectLedgerEntries(
            { ledgerTransactionId },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()
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
          async ({
            transaction,
            emitEvent,
            invalidateCache,
            enqueueLedgerCommand,
            cacheRecomputationContext,
          }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: initialEventDetails },
                livemode: true,
              },
              {
                transaction,
                cacheRecomputationContext,
                emitEvent,
                invalidateCache,
                enqueueLedgerCommand,
              }
            )
          }
        )

      let initialLedgerTransactions: LedgerTransaction.Record[] = [](
        await adminTransactionWithResult(async ({ transaction }) => {
          initialLedgerTransactions = await selectLedgerTransactions(
            {
              initiatingSourceId: initialEvent!.id,
              initiatingSourceType:
                LedgerTransactionInitiatingSourceType.UsageEvent,
            },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()
      const initialLedgerItemCount =
        initialLedgerTransactions.length > 0
          ? (
              await adminTransactionWithResult(
                async ({ transaction }) => {
                  return Result.ok(
                    await selectLedgerEntries(
                      {
                        ledgerTransactionId:
                          initialLedgerTransactions[0].id,
                      },
                      transaction
                    )
                  )
                }
              )
            ).unwrap().length
          : 0

      const { usageEvent: resultEvent } =
        await comprehensiveAdminTransaction(
          async ({
            transaction,
            emitEvent,
            invalidateCache,
            enqueueLedgerCommand,
            cacheRecomputationContext,
          }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: initialEventDetails },
                livemode: true,
              },
              {
                transaction,
                cacheRecomputationContext,
                emitEvent,
                invalidateCache,
                enqueueLedgerCommand,
              }
            )
          }
        )

      expect(resultEvent.id).toBe(initialEvent.id)

      let subsequentLedgerTransactions: LedgerTransaction.Record[] =
        [](
          await adminTransactionWithResult(
            async ({ transaction }) => {
              subsequentLedgerTransactions =
                await selectLedgerTransactions(
                  {
                    initiatingSourceId: resultEvent!.id,
                    initiatingSourceType:
                      LedgerTransactionInitiatingSourceType.UsageEvent,
                  },
                  transaction
                )
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      const subsequentLedgerItemCount =
        subsequentLedgerTransactions.length > 0
          ? (
              await adminTransactionWithResult(
                async ({ transaction }) => {
                  return Result.ok(
                    await selectLedgerEntries(
                      {
                        ledgerTransactionId:
                          subsequentLedgerTransactions[0].id,
                      },
                      transaction
                    )
                  )
                }
              )
            ).unwrap().length
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
      })(
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await ingestAndProcessUsageEvent(
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
              createDiscardingEffectsContext(transaction)
            )
          )
        })
      ).unwrap()

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

      const result = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await ingestAndProcessUsageEvent(
              { input: inputMainSub, livemode: true },
              createDiscardingEffectsContext(transaction)
            )
          )
        })
      ).unwrap()
      expect(result.status).toBe('error')
      if (result.status === 'error') {
        expect(result.error.message).toContain(
          `A usage event already exists for transactionid ${sharedTransactionId}, but does not belong to subscription ${mainSubscription.id}.`
        )
      }
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
          async ({
            transaction,
            emitEvent,
            invalidateCache,
            enqueueLedgerCommand,
            cacheRecomputationContext,
          }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: propsPresentDetails },
                livemode: true,
              },
              {
                transaction,
                cacheRecomputationContext,
                emitEvent,
                invalidateCache,
                enqueueLedgerCommand,
              }
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
          async ({
            transaction,
            emitEvent,
            invalidateCache,
            enqueueLedgerCommand,
            cacheRecomputationContext,
          }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: propsAbsentDetails },
                livemode: true,
              },
              {
                transaction,
                cacheRecomputationContext,
                emitEvent,
                invalidateCache,
                enqueueLedgerCommand,
              }
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
          async ({
            transaction,
            emitEvent,
            invalidateCache,
            enqueueLedgerCommand,
            cacheRecomputationContext,
          }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: datePresentDetails },
                livemode: true,
              },
              {
                transaction,
                cacheRecomputationContext,
                emitEvent,
                invalidateCache,
                enqueueLedgerCommand,
              }
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
          async ({
            transaction,
            emitEvent,
            invalidateCache,
            enqueueLedgerCommand,
            cacheRecomputationContext,
          }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: dateAbsentDetails },
                livemode: true,
              },
              {
                transaction,
                cacheRecomputationContext,
                emitEvent,
                invalidateCache,
                enqueueLedgerCommand,
              }
            )
          }
        )
      expect(typeof resultWithoutDate.usageDate).toBe('number')
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
          async ({
            transaction,
            emitEvent,
            invalidateCache,
            enqueueLedgerCommand,
            cacheRecomputationContext,
          }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: liveTrueDetails },
                livemode: true,
              },
              {
                transaction,
                cacheRecomputationContext,
                emitEvent,
                invalidateCache,
                enqueueLedgerCommand,
              }
            )
          }
        )
      expect(resultLiveTrue.livemode).toBe(true)

      const liveTrueTransactions: LedgerTransaction.Record[] = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await selectLedgerTransactions(
              {
                initiatingSourceId: resultLiveTrue.id,
                initiatingSourceType:
                  LedgerTransactionInitiatingSourceType.UsageEvent,
              },
              transaction
            )
          )
        })
      ).unwrap()
      expect(liveTrueTransactions.length).toBe(1)
      const liveTrueLedgerItems: LedgerEntry.Record[] = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await selectLedgerEntries(
              { ledgerTransactionId: liveTrueTransactions[0].id },
              transaction
            )
          )
        })
      ).unwrap()
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
          async ({
            transaction,
            emitEvent,
            invalidateCache,
            enqueueLedgerCommand,
            cacheRecomputationContext,
          }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: liveFalseDetails },
                livemode: false,
              },
              {
                transaction,
                cacheRecomputationContext,
                emitEvent,
                invalidateCache,
                enqueueLedgerCommand,
              }
            )
          }
        )
      expect(resultLiveFalse.livemode).toBe(false)

      const liveFalseTransactions: LedgerTransaction.Record[] = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await selectLedgerTransactions(
              {
                initiatingSourceId: resultLiveFalse!.id,
                initiatingSourceType:
                  LedgerTransactionInitiatingSourceType.UsageEvent,
              },
              transaction
            )
          )
        })
      ).unwrap()
      expect(liveFalseTransactions.length).toBe(1)
      const liveFalseLedgerItems: LedgerEntry.Record[] = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await selectLedgerEntries(
              { ledgerTransactionId: liveFalseTransactions[0].id },
              transaction
            )
          )
        })
      ).unwrap()
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
          async ({
            transaction,
            emitEvent,
            invalidateCache,
            enqueueLedgerCommand,
            cacheRecomputationContext,
          }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: firstEventDetails },
                livemode: true,
              },
              {
                transaction,
                cacheRecomputationContext,
                emitEvent,
                invalidateCache,
                enqueueLedgerCommand,
              }
            )
          }
        )

      // Verify first usage event was inserted with correct properties
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
      const firstLedgerTransactions = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await selectLedgerTransactions(
              {
                initiatingSourceId: firstUsageEvent.id,
                initiatingSourceType:
                  LedgerTransactionInitiatingSourceType.UsageEvent,
              },
              transaction
            )
          )
        })
      ).unwrap()
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
          async ({
            transaction,
            emitEvent,
            invalidateCache,
            enqueueLedgerCommand,
            cacheRecomputationContext,
          }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: secondEventDetails },
                livemode: true,
              },
              {
                transaction,
                cacheRecomputationContext,
                emitEvent,
                invalidateCache,
                enqueueLedgerCommand,
              }
            )
          }
        )

      // Verify second usage event was inserted with correct properties
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
      const secondLedgerTransactions = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await selectLedgerTransactions(
              {
                initiatingSourceId: secondUsageEvent.id,
                initiatingSourceType:
                  LedgerTransactionInitiatingSourceType.UsageEvent,
              },
              transaction
            )
          )
        })
      ).unwrap()
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
          async ({
            transaction,
            emitEvent,
            invalidateCache,
            enqueueLedgerCommand,
            cacheRecomputationContext,
          }) => {
            return ingestAndProcessUsageEvent(
              {
                input: { usageEvent: thirdEventDetails },
                livemode: true,
              },
              {
                transaction,
                cacheRecomputationContext,
                emitEvent,
                invalidateCache,
                enqueueLedgerCommand,
              }
            )
          }
        )
      expect(thirdUsageEvent.properties).toEqual({
        ...testProperties,
        feature: 'import',
      })
      expect(thirdUsageEvent.billingPeriodId).toBe(
        distinctBillingPeriod.id
      )
      expect(thirdUsageEvent.usageMeterId).toBe(usageMeter.id)
      expect(typeof thirdUsageEvent.usageDate).toBe('number')

      // Verify ledger command was emitted (ledger transaction created)
      const thirdLedgerTransactions = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await selectLedgerTransactions(
              {
                initiatingSourceId: thirdUsageEvent.id,
                initiatingSourceType:
                  LedgerTransactionInitiatingSourceType.UsageEvent,
              },
              transaction
            )
          )
        })
      ).unwrap()
      expect(thirdLedgerTransactions.length).toBe(1)
    })

    it('should throw error when usageMeterId from different pricing model is provided directly', async () => {
      // Create a usage meter and price in a different organization
      const { otherOrgUsageMeter, otherOrgPrice } = (
        await adminTransactionWithResult(async ({ transaction }) => {
          const orgSetup = await setupOrg()
          const testUsageMeter = await setupUsageMeter({
            organizationId: orgSetup.organization.id,
            name: 'Other Org Usage Meter',
            livemode: true,
            pricingModelId: orgSetup.pricingModel.id,
          })
          const testPrice = await setupPrice({
            name: 'Other Org Usage Price',
            type: PriceType.Usage,
            unitPrice: 10,
            intervalUnit: IntervalUnit.Day,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            currency: CurrencyCode.USD,
            usageMeterId: testUsageMeter.id,
          })
          return Result.ok(
            await {
              otherOrgUsageMeter: testUsageMeter,
              otherOrgPrice: testPrice,
            }
          )
        })
      ).unwrap()

      const input: CreateUsageEventInput = {
        usageEvent: {
          subscriptionId: mainSubscription.id, // Belongs to original org
          usageMeterId: otherOrgUsageMeter.id, // Belongs to different org
          priceId: otherOrgPrice.id, // Price from different org (matches the meter)
          amount: 100,
          transactionId: `txn_wrong_pricing_model_${core.nanoid()}`,
        },
      }

      const result = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await ingestAndProcessUsageEvent(
              { input, livemode: true },
              createDiscardingEffectsContext(transaction)
            )
          )
        })
      ).unwrap()
      expect(result.status).toBe('error')
      if (result.status === 'error') {
        // When both usageMeterId and priceId from a different org are provided,
        // the priceId validation runs first since it's explicitly provided
        expect(result.error.message).toContain(
          `Price not found: ${otherOrgPrice.id} (not in customer's pricing model)`
        )
      }
    })

    it('should throw error when priceId from different pricing model is provided directly', async () => {
      // Create a usage price in a different organization/pricing model
      const otherOrgPrice = (
        await adminTransactionWithResult(async ({ transaction }) => {
          const otherOrgSetup = await setupOrg()
          const otherUsageMeter = await setupUsageMeter({
            organizationId: otherOrgSetup.organization.id,
            name: 'Other Org Usage Meter',
            livemode: true,
            pricingModelId: otherOrgSetup.pricingModel.id,
          })
          const otherPrice = await setupPrice({
            name: 'Other Org Usage Price',
            type: PriceType.Usage,
            unitPrice: 10,
            intervalUnit: IntervalUnit.Day,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            currency: CurrencyCode.USD,
            usageMeterId: otherUsageMeter.id,
          })
          return Result.ok(await otherPrice)
        })
      ).unwrap()

      const input: CreateUsageEventInput = {
        usageEvent: {
          subscriptionId: mainSubscription.id, // Belongs to original org
          priceId: otherOrgPrice.id, // Belongs to different org
          usageMeterId: otherOrgPrice.usageMeterId!,
          amount: 100,
          transactionId: `txn_wrong_pricing_model_price_${core.nanoid()}`,
        },
      }

      const result = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await ingestAndProcessUsageEvent(
              { input, livemode: true },
              createDiscardingEffectsContext(transaction)
            )
          )
        })
      ).unwrap()
      expect(result.status).toBe('error')
      if (result.status === 'error') {
        expect(result.error.message).toContain(
          `Price not found: ${otherOrgPrice.id} (not in customer's pricing model)`
        )
      }
    })

    it('should use the provided default price when usageMeterId and priceId are both provided', async () => {
      // The usagePrice created in beforeEach is associated with usageMeter but is NOT the default.
      // We create a default price for the usage meter to test the scenario where a resolved
      // input includes the default price (priceId resolution would have happened upstream).
      const defaultPrice = await setupPrice({
        name: 'Default Price for Direct Meter Test',
        type: PriceType.Usage,
        unitPrice: 0,
        intervalUnit: IntervalUnit.Day,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        currency: CurrencyCode.USD,
        usageMeterId: usageMeter.id,
      })

      const input: CreateUsageEventInput = {
        usageEvent: {
          subscriptionId: mainSubscription.id,
          usageMeterId: usageMeter.id, // Valid usage meter from customer's pricing model
          priceId: defaultPrice.id, // Default price for this meter (resolved upstream)
          amount: 100,
          transactionId: `txn_direct_usage_meter_${core.nanoid()}`,
          properties: { test_property: 'direct_usage_meter_test' },
        },
      }

      const { usageEvent: createdUsageEvent } =
        await comprehensiveAdminTransaction(
          async ({
            transaction,
            emitEvent,
            invalidateCache,
            enqueueLedgerCommand,
            cacheRecomputationContext,
          }) => {
            return ingestAndProcessUsageEvent(
              { input, livemode: true },
              {
                transaction,
                cacheRecomputationContext,
                emitEvent,
                invalidateCache,
                enqueueLedgerCommand,
              }
            )
          }
        )

      // Should resolve to the default price for the usage meter
      expect(createdUsageEvent.priceId).toBe(defaultPrice.id)
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

    it('should throw error when CountDistinctProperties meter is used with empty properties', async () => {
      const { distinctMeter, distinctPrice, distinctSubscription } =
        await setupCountDistinctPropertiesMeter({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          pricingModelId: orgSetup.pricingModel.id,
          productId: orgSetup.product.id,
        })

      // Test with undefined properties
      const undefinedPropsInput: CreateUsageEventInput = {
        usageEvent: {
          usageMeterId: distinctMeter.id,
          priceId: distinctPrice.id,
          subscriptionId: distinctSubscription.id,
          transactionId: `txn_empty_props_undefined_${core.nanoid()}`,
          amount: 100,
          // properties intentionally omitted (undefined)
        },
      }

      const result1 = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await ingestAndProcessUsageEvent(
              { input: undefinedPropsInput, livemode: true },
              createDiscardingEffectsContext(transaction)
            )
          )
        })
      ).unwrap()
      expect(result1.status).toBe('error')
      if (result1.status === 'error') {
        expect(result1.error.message).toContain(
          'Properties are required'
        )
      }

      // Test with empty object properties
      const emptyPropsInput: CreateUsageEventInput = {
        usageEvent: {
          usageMeterId: distinctMeter.id,
          priceId: distinctPrice.id,
          subscriptionId: distinctSubscription.id,
          transactionId: `txn_empty_props_object_${core.nanoid()}`,
          amount: 100,
          properties: {},
        },
      }

      const result2 = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await ingestAndProcessUsageEvent(
              { input: emptyPropsInput, livemode: true },
              createDiscardingEffectsContext(transaction)
            )
          )
        })
      ).unwrap()
      expect(result2.status).toBe('error')
      if (result2.status === 'error') {
        expect(result2.error.message).toContain(
          'Properties are required'
        )
      }
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

      const result = (
        await adminTransactionWithResult(async ({ transaction }) => {
          const resolved = await resolveUsageEventInput(
            input,
            transaction
          )
          return Result.ok(await resolved.unwrap())
        })
      ).unwrap()

      expect(result.usageEvent.priceId).toBe(usagePrice.id)
      expect(result.usageEvent).not.toHaveProperty('priceSlug')
    })

    it('should resolve priceSlug to priceId when priceSlug is provided', async () => {
      // First, we need to set up a price with a slug
      const priceWithSlug = (
        await adminTransactionWithResult(async ({ transaction }) => {
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
          return Result.ok(
            await { testPrice, testSubscription, testCustomer }
          )
        })
      ).unwrap()

      const input = {
        usageEvent: {
          subscriptionId: priceWithSlug.testSubscription.id,
          priceSlug: 'test-usage-price-slug',
          amount: 100,
          transactionId: `txn_resolve_slug_${core.nanoid()}`,
        },
      }

      const result = (
        await adminTransactionWithResult(async ({ transaction }) => {
          const resolved = await resolveUsageEventInput(
            input,
            transaction
          )
          return Result.ok(await resolved.unwrap())
        })
      ).unwrap()

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

      const result = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await resolveUsageEventInput(
              inputNonExistent,
              transaction
            )
          )
        })
      ).unwrap()
      expect(result.status).toBe('error')
      if (result.status === 'error') {
        expect(result.error.message).toContain(
          "Price not found: with slug non-existent-slug (not in customer's pricing model)"
        )
      }
      // Set up a second pricing model in the same organization with a price with a slug
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          // Create a second pricing model in the same organization
          const secondPricingModel = await setupPricingModel({
            organizationId: organization.id,
            name: 'Second Pricing Model',
            livemode: false,
            isDefault: false,
          })

          // Create a product in the second pricing model
          const secondProduct = await setupProduct({
            organizationId: organization.id,
            pricingModelId: secondPricingModel.id,
            name: 'Second Product',
            livemode: false,
            active: true,
          })

          const secondUsageMeter = await setupUsageMeter({
            organizationId: organization.id,
            name: 'Second Usage Meter',
            livemode: false,
            pricingModelId: secondPricingModel.id,
          })

          // Create a price with a slug in the second pricing model
          await setupPrice({
            name: 'Second Usage Price',
            type: PriceType.Usage,
            unitPrice: 20,
            intervalUnit: IntervalUnit.Day,
            intervalCount: 1,
            livemode: false,
            isDefault: false,
            currency: CurrencyCode.USD,
            usageMeterId: secondUsageMeter.id,
            slug: 'other-pricing-model-price-slug',
          })
          return Result.ok(undefined)
        })
      ).unwrap()

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
      const result2 = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await resolveUsageEventInput(
              inputDifferentPricingModel,
              transaction
            )
          )
        })
      ).unwrap()
      expect(result2.status).toBe('error')
      if (result2.status === 'error') {
        expect(result2.error.message).toContain(
          "Price not found: with slug other-pricing-model-price-slug (not in customer's pricing model)"
        )
      }
    })

    it('should throw BAD_REQUEST error when neither priceId nor priceSlug is provided', async () => {
      const inputWithoutPrice = {
        usageEvent: {
          subscriptionId: mainSubscription.id,
          amount: 100,
          transactionId: `txn_no_price_${core.nanoid()}`,
        },
      }

      const result = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await resolveUsageEventInput(
              inputWithoutPrice,
              transaction
            )
          )
        })
      ).unwrap()
      expect(result.status).toBe('error')
      if (result.status === 'error') {
        expect(result.error.message).toContain(
          'Exactly one of priceId, priceSlug, usageMeterId, or usageMeterSlug must be provided'
        )
      }
    })

    it('should resolve usageMeterId to usage event with default price', async () => {
      // Set up a default price for the usage meter
      const defaultPrice = await setupPrice({
        name: 'Default Price for Meter ID Resolution',
        type: PriceType.Usage,
        unitPrice: 0,
        intervalUnit: IntervalUnit.Day,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        currency: CurrencyCode.USD,
        usageMeterId: usageMeter.id,
      })

      const input = {
        usageEvent: {
          subscriptionId: mainSubscription.id,
          usageMeterId: usageMeter.id,
          amount: 100,
          transactionId: `txn_resolve_um_id_${core.nanoid()}`,
        },
      }

      const result = (
        await adminTransactionWithResult(async ({ transaction }) => {
          const resolved = await resolveUsageEventInput(
            input,
            transaction
          )
          return Result.ok(await resolved.unwrap())
        })
      ).unwrap()

      expect(result.usageEvent.usageMeterId).toBe(usageMeter.id)
      // Should resolve to the default price for the usage meter
      expect(result.usageEvent.priceId).toBe(defaultPrice.id)
      expect(result.usageEvent).not.toHaveProperty('usageMeterSlug')
    })

    it('should resolve usageMeterSlug to usageMeterId with default price', async () => {
      // First, we need to set up a usage meter with a slug and a default price
      const usageMeterWithSlug = (
        await adminTransactionWithResult(async ({ transaction }) => {
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
          // Create a default price for the usage meter
          const testDefaultPrice = await setupPrice({
            name: 'Test Default Price',
            type: PriceType.Usage,
            unitPrice: 0,
            intervalUnit: IntervalUnit.Day,
            intervalCount: 1,
            livemode: true,
            isDefault: true,
            currency: CurrencyCode.USD,
            usageMeterId: testUsageMeter.id,
          })
          // Create a non-default price for the subscription
          const testPrice = await setupPrice({
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
          return Result.ok(
            await {
              testUsageMeter,
              testSubscription,
              testCustomer,
              testDefaultPrice,
            }
          )
        })
      ).unwrap()

      const input = {
        usageEvent: {
          subscriptionId: usageMeterWithSlug.testSubscription.id,
          usageMeterSlug: 'test-usage-meter-slug',
          amount: 100,
          transactionId: `txn_resolve_um_slug_${core.nanoid()}`,
        },
      }

      const result = (
        await adminTransactionWithResult(async ({ transaction }) => {
          const resolved = await resolveUsageEventInput(
            input,
            transaction
          )
          return Result.ok(await resolved.unwrap())
        })
      ).unwrap()

      expect(result.usageEvent.usageMeterId).toBe(
        usageMeterWithSlug.testUsageMeter.id
      )
      // Should resolve to the default price for the usage meter
      expect(result.usageEvent.priceId).toBe(
        usageMeterWithSlug.testDefaultPrice.id
      )
      expect(result.usageEvent).not.toHaveProperty('usageMeterSlug')
    })

    it('should throw NOT_FOUND error when usageMeterId does not exist in customer pricing model', async () => {
      // Create a usage meter in a different organization
      const otherOrgUsageMeter = (
        await adminTransactionWithResult(async ({ transaction }) => {
          const orgSetup = await setupOrg()
          const testUsageMeter = await setupUsageMeter({
            organizationId: orgSetup.organization.id,
            name: 'Other Org Usage Meter',
            livemode: true,
            pricingModelId: orgSetup.pricingModel.id,
          })
          return Result.ok(await testUsageMeter)
        })
      ).unwrap()

      const input = {
        usageEvent: {
          subscriptionId: mainSubscription.id, // Belongs to original org
          usageMeterId: otherOrgUsageMeter.id, // Belongs to different org
          amount: 100,
          transactionId: `txn_wrong_org_um_${core.nanoid()}`,
        },
      }

      const result = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await resolveUsageEventInput(input, transaction)
          )
        })
      ).unwrap()
      expect(result.status).toBe('error')
      if (result.status === 'error') {
        expect(result.error.message).toContain(
          `UsageMeter not found: ${otherOrgUsageMeter.id} (not in customer's pricing model)`
        )
      }
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

      const result = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await resolveUsageEventInput(input, transaction)
          )
        })
      ).unwrap()
      expect(result.status).toBe('error')
      if (result.status === 'error') {
        expect(result.error.message).toContain(
          "UsageMeter not found: with slug non-existent-usage-meter-slug (not in customer's pricing model)"
        )
      }
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
      name: 'Distinct Price',
      type: PriceType.Usage,
      unitPrice: 10,
      intervalUnit: IntervalUnit.Day,
      intervalCount: 1,
      livemode: true,
      isDefault: true, // Set as default so it can be resolved when events use usageMeterId without priceId
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

  describe('generateLedgerCommandsForBulkUsageEvents', () => {
    it('should generate ledger commands for all inserted events when none are duplicates and include organizationId and subscriptionId from subscription lookup', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
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

          const ledgerCommandsResult =
            await generateLedgerCommandsForBulkUsageEvents(
              {
                insertedUsageEvents: [event1, event2, event3],
                livemode: true,
              },
              transaction
            )
          const ledgerCommands = ledgerCommandsResult.unwrap()

          expect(ledgerCommands.length).toBe(3)
          expect(ledgerCommands[0].type).toBe(
            LedgerTransactionType.UsageEventProcessed
          )
          expect(ledgerCommands[0].livemode).toBe(true)
          expect(ledgerCommands[0].organizationId).toBe(
            organization.id
          )
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
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should skip ledger commands for CountDistinctProperties duplicates in same period, including intra-batch duplicates (with different key order) and existing database duplicates', async () => {
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

      // Create an existing event in the database first (for testing duplicates against DB)
      const existingEventProps = {
        user_id: 'user_789',
        feature: 'delete',
      }
      await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: distinctSubscription.id,
        usageMeterId: distinctMeter.id,
        customerId: customer.id,
        amount: 1,
        transactionId: `txn_${core.nanoid()}`,
        priceId: distinctPrice.id,
        properties: existingEventProps,
        billingPeriodId: distinctBillingPeriod.id,
      })

      // Setup two events with same property values but different key order to test intra-batch deduplication and stable stringification
      const propsA = {
        user_id: 'user_456',
        feature: 'import',
      }
      const propsB = {
        feature: 'import',
        user_id: 'user_456',
      }
      const event1 = await setupUsageEvent({
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
      const event2 = await setupUsageEvent({
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

      // Setup event with properties matching the existing database event to test DB duplicate detection
      const newEventWithDuplicateProps = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: distinctSubscription.id,
        usageMeterId: distinctMeter.id,
        customerId: customer.id,
        amount: 1,
        transactionId: `txn_${core.nanoid()}`,
        priceId: distinctPrice.id,
        properties: existingEventProps,
        billingPeriodId: distinctBillingPeriod.id,
      })(
        await adminTransactionWithResult(async ({ transaction }) => {
          const ledgerCommandsResult =
            await generateLedgerCommandsForBulkUsageEvents(
              {
                insertedUsageEvents: [
                  event1,
                  event2,
                  newEventWithDuplicateProps,
                ],
                livemode: true,
              },
              transaction
            )
          const ledgerCommands = ledgerCommandsResult.unwrap()

          // Should generate 1 command:
          // - event1 (event2 is intra-batch duplicate with different key order)
          // - newEventWithDuplicateProps is skipped (duplicate of existing DB event)
          expect(ledgerCommands.length).toBe(1)
          expect(ledgerCommands[0].payload.usageEvent.id).toBe(
            event1.id
          )

          // Explicitly verify that duplicate events are not included
          const eventIds = ledgerCommands.map(
            (cmd) => cmd.payload.usageEvent.id
          )
          expect(eventIds).not.toContain(event2.id)
          expect(eventIds).not.toContain(
            newEventWithDuplicateProps.id
          )
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should return empty array when no events provided', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const ledgerCommandsResult =
            await generateLedgerCommandsForBulkUsageEvents(
              {
                insertedUsageEvents: [],
                livemode: true,
              },
              transaction
            )
          const ledgerCommands = ledgerCommandsResult.unwrap()

          expect(ledgerCommands.length).toBe(0)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should throw error when subscription not found', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const usageEvent = await setupUsageEvent({
            organizationId: organization.id,
            subscriptionId: mainSubscription.id,
            usageMeterId: usageMeter.id,
            customerId: customer.id,
            amount: 10,
            transactionId: `txn_${core.nanoid()}`,
            priceId: usagePrice.id,
          })

          const invalidSubscriptionEvent = {
            ...usageEvent,
            subscriptionId: 'non-existent-subscription-id',
          }

          const result =
            await generateLedgerCommandsForBulkUsageEvents(
              {
                insertedUsageEvents: [invalidSubscriptionEvent],
                livemode: true,
              },
              transaction
            )
          expect(() => result.unwrap()).toThrow(
            'Subscription not found: non-existent-subscription-id'
          )
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should throw error when usage meter not found', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const usageEvent = await setupUsageEvent({
            organizationId: organization.id,
            subscriptionId: mainSubscription.id,
            usageMeterId: usageMeter.id,
            customerId: customer.id,
            amount: 10,
            transactionId: `txn_${core.nanoid()}`,
            priceId: usagePrice.id,
          })

          const invalidMeterEvent = {
            ...usageEvent,
            usageMeterId: 'non-existent-usage-meter-id',
          }

          const result =
            await generateLedgerCommandsForBulkUsageEvents(
              {
                insertedUsageEvents: [invalidMeterEvent],
                livemode: true,
              },
              transaction
            )
          expect(() => result.unwrap()).toThrow(
            'UsageMeter not found: non-existent-usage-meter-id'
          )
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })
})
