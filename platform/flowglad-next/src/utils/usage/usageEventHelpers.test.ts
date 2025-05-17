import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as core from 'nanoid'

// Schema imports
import { Organization } from '@/db/schema/organizations'
import { Customer } from '@/db/schema/customers'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Price } from '@/db/schema/prices'
import { Subscription } from '@/db/schema/subscriptions'
import {
  UsageEvent,
  CreateUsageEventInput,
} from '@/db/schema/usageEvents'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { UsageLedgerItem } from '@/db/schema/usageLedgerItems'
import { UsageTransaction } from '@/db/schema/usageTransactions'

// Setup helpers from seedDatabase.ts
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupPrice,
  setupSubscription,
  setupBillingPeriod,
  setupUsageMeter,
} from '@/../seedDatabase'
import {
  PriceType,
  UsageTransactionInitiatingSourceType,
  IntervalUnit,
  CurrencyCode,
} from '@/types'

// Function to test
import { ingestAndProcessUsageEvent } from '@/utils/usage/usageEventHelpers'
import { adminTransaction } from '@/db/adminTransaction'
import { selectUsageLedgerItems } from '@/db/tableMethods/usageLedgerItemMethods'
import { selectUsageTransactions } from '@/db/tableMethods/usageTransactionMethods'

describe('usageEventHelpers', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let usagePrice: Price.Record
  let mainSubscription: Subscription.Record
  let mainBillingPeriod: BillingPeriod.Record

  beforeEach(async () => {
    await adminTransaction(async ({ transaction }) => {
      const orgSetup = await setupOrg()
      organization = orgSetup.organization

      customer = await setupCustomer({
        organizationId: organization.id,
      })
      paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })

      const defaultCatalogForOrg = orgSetup.catalog
      const defaultProductForOrg = orgSetup.product
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Test Usage Meter',
        livemode: true,
        catalogId: defaultCatalogForOrg.id,
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
        setupFeeAmount: 0,
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
        subscriptionId: mainSubscription.id,
        transactionId: `txn_${core.nanoid()}`,
        amount: 10,
        usageDate: new Date().getTime(),
        properties: { custom_field: 'happy_path_value' },
      }
      const input: CreateUsageEventInput = {
        usageEvent: usageEventDetails,
      }

      const createdUsageEvent: UsageEvent.Record =
        await adminTransaction(async ({ transaction }) => {
          return ingestAndProcessUsageEvent(
            { input, livemode: true },
            transaction
          )
        })

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

      let usageTransactions: UsageTransaction.Record[] = []
      await adminTransaction(async ({ transaction }) => {
        usageTransactions = await selectUsageTransactions(
          {
            initiatingSourceId: createdUsageEvent!.id,
            initiatingSourceType:
              UsageTransactionInitiatingSourceType.UsageEvent,
          },
          transaction
        )
      })
      expect(usageTransactions.length).toBe(1)
      const usageTransactionId = usageTransactions[0].id

      let ledgerItems: UsageLedgerItem.Record[] = []
      await adminTransaction(async ({ transaction }) => {
        ledgerItems = await selectUsageLedgerItems(
          { usageTransactionId },
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
          subscriptionId: mainSubscription.id,
          transactionId,
          amount: 5,
        }
      const initialEvent: UsageEvent.Record = await adminTransaction(
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

      let initialUsageTransactions: UsageTransaction.Record[] = []
      await adminTransaction(async ({ transaction }) => {
        initialUsageTransactions = await selectUsageTransactions(
          {
            initiatingSourceId: initialEvent!.id,
            initiatingSourceType:
              UsageTransactionInitiatingSourceType.UsageEvent,
          },
          transaction
        )
      })
      const initialLedgerItemCount =
        initialUsageTransactions.length > 0
          ? (
              await adminTransaction(async ({ transaction }) =>
                selectUsageLedgerItems(
                  {
                    usageTransactionId:
                      initialUsageTransactions[0].id,
                  },
                  transaction
                )
              )
            ).length
          : 0

      const resultEvent: UsageEvent.Record = await adminTransaction(
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

      let subsequentUsageTransactions: UsageTransaction.Record[] = []
      await adminTransaction(async ({ transaction }) => {
        subsequentUsageTransactions = await selectUsageTransactions(
          {
            initiatingSourceId: resultEvent!.id,
            initiatingSourceType:
              UsageTransactionInitiatingSourceType.UsageEvent,
          },
          transaction
        )
      })
      const subsequentLedgerItemCount =
        subsequentUsageTransactions.length > 0
          ? (
              await adminTransaction(async ({ transaction }) =>
                selectUsageLedgerItems(
                  {
                    usageTransactionId:
                      subsequentUsageTransactions[0].id,
                  },
                  transaction
                )
              )
            ).length
          : 0
      expect(subsequentLedgerItemCount).toBe(initialLedgerItemCount)
    })

    it('should throw error if no current billing period is found for the subscription', async () => {
      const testSubWithoutBP: Subscription.Record =
        await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: usagePrice.id,
        })

      const usageEventDetails: CreateUsageEventInput['usageEvent'] = {
        priceId: usagePrice.id,
        subscriptionId: testSubWithoutBP.id,
        transactionId: `txn_no_bp_${core.nanoid()}`,
        amount: 1,
      }
      const input: CreateUsageEventInput = {
        usageEvent: usageEventDetails,
      }

      await expect(
        adminTransaction(async ({ transaction }) => {
          return ingestAndProcessUsageEvent(
            { input, livemode: true },
            transaction
          )
        })
      ).rejects.toThrow('Billing period not found')
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

      await adminTransaction(async ({ transaction }) => {
        return ingestAndProcessUsageEvent(
          {
            input: {
              usageEvent: {
                priceId: usagePrice.id,
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
          subscriptionId: mainSubscription.id,
          transactionId: `txn_props_${core.nanoid()}`,
          amount: 1,
          properties: { test: 'value' },
        }
      let resultWithProps: UsageEvent.Record | null = null
      await adminTransaction(async ({ transaction }) => {
        resultWithProps = await ingestAndProcessUsageEvent(
          {
            input: { usageEvent: propsPresentDetails },
            livemode: true,
          },
          transaction
        )
      })
      expect(resultWithProps!.properties).toEqual({ test: 'value' })

      const propsAbsentDetails: CreateUsageEventInput['usageEvent'] =
        {
          priceId: usagePrice.id,
          subscriptionId: mainSubscription.id,
          transactionId: `txn_no_props_${core.nanoid()}`,
          amount: 1,
        }
      let resultWithoutProps: UsageEvent.Record | null = null
      await adminTransaction(async ({ transaction }) => {
        resultWithoutProps = await ingestAndProcessUsageEvent(
          {
            input: { usageEvent: propsAbsentDetails },
            livemode: true,
          },
          transaction
        )
      })
      expect(resultWithoutProps!.properties).toEqual({})
    })

    it('should handle usageEvent.usageDate (timestamp and undefined)', async () => {
      const timestamp = new Date().getTime()
      const datePresentDetails: CreateUsageEventInput['usageEvent'] =
        {
          priceId: usagePrice.id,
          subscriptionId: mainSubscription.id,
          transactionId: `txn_date_${core.nanoid()}`,
          amount: 1,
          usageDate: timestamp,
        }
      const resultWithDate: UsageEvent.Record =
        await adminTransaction(async ({ transaction }) => {
          return ingestAndProcessUsageEvent(
            {
              input: { usageEvent: datePresentDetails },
              livemode: true,
            },
            transaction
          )
        })
      expect(resultWithDate.usageDate!.getTime()).toBe(timestamp)

      const dateAbsentDetails: CreateUsageEventInput['usageEvent'] = {
        priceId: usagePrice.id,
        subscriptionId: mainSubscription.id,
        transactionId: `txn_no_date_${core.nanoid()}`,
        amount: 1,
      }
      const resultWithoutDate: UsageEvent.Record =
        await adminTransaction(async ({ transaction }) => {
          return ingestAndProcessUsageEvent(
            {
              input: { usageEvent: dateAbsentDetails },
              livemode: true,
            },
            transaction
          )
        })
      expect(resultWithoutDate.usageDate).toBeDefined()
    })

    it('should handle livemode input correctly (true and false)', async () => {
      const liveTrueDetails: CreateUsageEventInput['usageEvent'] = {
        priceId: usagePrice.id,
        subscriptionId: mainSubscription.id,
        transactionId: `txn_live_${core.nanoid()}`,
        amount: 1,
      }
      const resultLiveTrue: UsageEvent.Record =
        await adminTransaction(async ({ transaction }) => {
          return ingestAndProcessUsageEvent(
            {
              input: { usageEvent: liveTrueDetails },
              livemode: true,
            },
            transaction
          )
        })
      expect(resultLiveTrue.livemode).toBe(true)

      const liveTrueTransactions: UsageTransaction.Record[] =
        await adminTransaction(async ({ transaction }) => {
          return selectUsageTransactions(
            {
              initiatingSourceId: resultLiveTrue!.id,
              initiatingSourceType:
                UsageTransactionInitiatingSourceType.UsageEvent,
            },
            transaction
          )
        })
      expect(liveTrueTransactions.length).toBe(1)
      const liveTrueLedgerItems: UsageLedgerItem.Record[] =
        await adminTransaction(async ({ transaction }) => {
          return selectUsageLedgerItems(
            { usageTransactionId: liveTrueTransactions[0].id },
            transaction
          )
        })
      expect(liveTrueLedgerItems[0].livemode).toBe(true)

      const liveFalseDetails: CreateUsageEventInput['usageEvent'] = {
        priceId: usagePrice.id,
        subscriptionId: mainSubscription.id,
        transactionId: `txn_test_${core.nanoid()}`,
        amount: 1,
      }
      let resultLiveFalse: UsageEvent.Record | null = null
      await adminTransaction(async ({ transaction }) => {
        resultLiveFalse = await ingestAndProcessUsageEvent(
          {
            input: { usageEvent: liveFalseDetails },
            livemode: false,
          },
          transaction
        )
      })
      expect(resultLiveFalse!.livemode).toBe(false)

      const liveFalseTransactions: UsageTransaction.Record[] =
        await adminTransaction(async ({ transaction }) => {
          return selectUsageTransactions(
            {
              initiatingSourceId: resultLiveFalse!.id,
              initiatingSourceType:
                UsageTransactionInitiatingSourceType.UsageEvent,
            },
            transaction
          )
        })
      expect(liveFalseTransactions.length).toBe(1)
      const liveFalseLedgerItems: UsageLedgerItem.Record[] =
        await adminTransaction(async ({ transaction }) => {
          return selectUsageLedgerItems(
            { usageTransactionId: liveFalseTransactions[0].id },
            transaction
          )
        })
      expect(liveFalseLedgerItems[0].livemode).toBe(false)
    })
  })
})
