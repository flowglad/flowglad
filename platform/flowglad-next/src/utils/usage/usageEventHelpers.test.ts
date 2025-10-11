import { describe, it, expect, beforeEach } from 'vitest'
import * as core from 'nanoid'

// Schema imports
import { Organization } from '@/db/schema/organizations'
import { Customer } from '@/db/schema/customers'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Price } from '@/db/schema/prices'
import { Subscription } from '@/db/schema/subscriptions'
import { CreateUsageEventInput } from '@/db/schema/usageEvents'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { LedgerEntry } from '@/db/schema/ledgerEntries'
import { LedgerTransaction } from '@/db/schema/ledgerTransactions'

// Setup helpers from seedDatabase.ts
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupPrice,
  setupSubscription,
  setupBillingPeriod,
  setupUsageMeter,
  setupLedgerAccount,
} from '@/../seedDatabase'
import {
  PriceType,
  LedgerTransactionInitiatingSourceType,
  IntervalUnit,
  CurrencyCode,
} from '@/types'

// Function to test
import { ingestAndProcessUsageEvent } from '@/utils/usage/usageEventHelpers'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import { selectLedgerEntries } from '@/db/tableMethods/ledgerEntryMethods'
import { selectLedgerTransactions } from '@/db/tableMethods/ledgerTransactionMethods'
import { LedgerAccount } from '@/db/schema/ledgerAccounts'
import { TransactionOutput } from '@/db/transactionEnhacementTypes'

describe('usageEventHelpers', () => {
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let usagePrice: Price.Record
  let mainSubscription: Subscription.Record
  let mainBillingPeriod: BillingPeriod.Record
  let ledgerAccount: LedgerAccount.Record
  let organization: Organization.Record
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

      const defaultPricingModelForOrg = orgSetup.pricingModel
      const defaultProductForOrg = orgSetup.product
      const usageMeter = await setupUsageMeter({
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
      ledgerAccount = await setupLedgerAccount({
        subscriptionId: mainSubscription.id,
        usageMeterId: usageMeter.id,
        livemode: true,
        organizationId: organization.id,
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
  })
})
