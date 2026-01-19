import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupLedgerAccount,
  setupUsageCredit,
  setupUsageLedgerScenario,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { processCreditGrantRecognizedLedgerCommand } from '@/db/ledgerManager/creditGrantRecognizedLedgerCommand'
import type { CreditGrantRecognizedLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Customer } from '@/db/schema/customers'
import type { LedgerAccount } from '@/db/schema/ledgerAccounts'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import type { Subscription } from '@/db/schema/subscriptions'
import type { UsageCredit } from '@/db/schema/usageCredits'
import type { UsageMeter } from '@/db/schema/usageMeters'
import {
  aggregateBalanceForLedgerAccountFromEntries,
  selectLedgerEntries,
} from '@/db/tableMethods/ledgerEntryMethods'
import { selectLedgerTransactions } from '@/db/tableMethods/ledgerTransactionMethods'
import {
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  LedgerTransactionType,
  UsageCreditType,
} from '@/types'
import core from '@/utils/core'

describe('processCreditGrantRecognizedLedgerCommand', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let usageMeter: UsageMeter.Record
  let billingPeriod: BillingPeriod.Record
  let ledgerAccount: LedgerAccount.Record

  beforeEach(async () => {
    const scenarioData = await setupUsageLedgerScenario({})

    organization = scenarioData.organization
    pricingModel = scenarioData.pricingModel
    product = scenarioData.product
    price = scenarioData.price
    customer = scenarioData.customer
    paymentMethod = scenarioData.paymentMethod
    subscription = scenarioData.subscription
    usageMeter = scenarioData.usageMeter
    billingPeriod = scenarioData.billingPeriod
    ledgerAccount = scenarioData.ledgerAccount
  })
  it('should successfully process a credit grant with all fields provided', async () => {
    ;(
      await adminTransaction(async ({ transaction }) => {
        const usageCredit = await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 1000,
          billingPeriodId: billingPeriod.id,
          livemode: true,
        })

        const transactionDescription = 'Test transaction description'
        const transactionMetadata = { testKey: 'testValue' }
        const command: CreditGrantRecognizedLedgerCommand = {
          organizationId: organization.id,
          livemode: true,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.CreditGrantRecognized,
          transactionDescription,
          transactionMetadata,
          payload: {
            usageCredit,
          },
        }

        const timestampBeforeExecution = Date.now()
        const initialBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )

        const result =
          await processCreditGrantRecognizedLedgerCommand(
            command,
            transaction
          )
        const timestampAfterExecution = Date.now()

        expect(result.ledgerEntries.length).toBe(1)

        const ledgerTransaction = result.ledgerTransaction
        expect(typeof ledgerTransaction.id).toBe('string')
        expect(ledgerTransaction.organizationId).toBe(
          command.organizationId
        )
        expect(ledgerTransaction.livemode).toBe(command.livemode)
        expect(ledgerTransaction.type).toBe(
          LedgerTransactionType.CreditGrantRecognized
        )
        expect(ledgerTransaction.description).toBe(
          transactionDescription
        )
        expect(ledgerTransaction.metadata).toEqual(
          transactionMetadata
        )
        expect(ledgerTransaction.initiatingSourceType).toBe(
          command.type
        )
        expect(ledgerTransaction.initiatingSourceId).toBe(
          usageCredit.id
        )
        expect(ledgerTransaction.subscriptionId).toBe(
          command.subscriptionId
        )

        const ledgerEntry = result.ledgerEntries[0]
        expect(typeof ledgerEntry.id).toBe('string')
        expect(ledgerEntry.ledgerTransactionId).toBe(
          ledgerTransaction.id
        )
        expect(ledgerEntry.ledgerAccountId).toBe(ledgerAccount.id)
        expect(ledgerEntry.subscriptionId).toBe(
          command.subscriptionId
        )
        expect(ledgerEntry.organizationId).toBe(
          command.organizationId
        )
        expect(ledgerEntry.livemode).toBe(command.livemode)
        expect(ledgerEntry.status).toBe(LedgerEntryStatus.Posted)
        expect(ledgerEntry.discardedAt).toBeNull()
        expect(ledgerEntry.direction).toBe(
          LedgerEntryDirection.Credit
        )
        expect(ledgerEntry.entryType).toBe(
          LedgerEntryType.CreditGrantRecognized
        )
        expect(ledgerEntry.amount).toBe(usageCredit.issuedAmount)
        expect(ledgerEntry.description).toBe(
          `Promotional credit ${usageCredit.id} granted.`
        )
        expect(ledgerEntry.sourceUsageCreditId).toBe(usageCredit.id)
        expect(ledgerEntry.billingPeriodId).toBe(
          usageCredit.billingPeriodId
        )
        expect(ledgerEntry.usageMeterId).toBe(
          usageCredit.usageMeterId
        )
        expect(ledgerEntry.claimedByBillingRunId).toBeNull()
        expect(ledgerEntry.metadata).toEqual({
          ledgerCommandType: command.type,
        })
        expect(ledgerEntry.entryTimestamp).toBeTypeOf('number')
        expect(ledgerEntry.entryTimestamp).toBeGreaterThanOrEqual(
          timestampBeforeExecution
        )
        expect(ledgerEntry.entryTimestamp).toBeLessThanOrEqual(
          timestampAfterExecution
        )
        expect(ledgerEntry.sourceUsageEventId).toBeNull()
        expect(ledgerEntry.sourceCreditApplicationId).toBeNull()
        expect(ledgerEntry.sourceCreditBalanceAdjustmentId).toBeNull()
        expect(
          ledgerEntry.sourceBillingPeriodCalculationId
        ).toBeNull()

        const dbLedgerTransaction = await selectLedgerTransactions(
          { id: ledgerTransaction.id },
          transaction
        )
        expect(dbLedgerTransaction.length).toBe(1)
        expect(dbLedgerTransaction[0]).toEqual(ledgerTransaction)

        const dbLedgerEntries = await selectLedgerEntries(
          { id: ledgerEntry.id },
          transaction
        )
        expect(dbLedgerEntries.length).toBe(1)
        expect(dbLedgerEntries[0]).toEqual(ledgerEntry)

        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(finalBalance).toBe(
          initialBalance + usageCredit.issuedAmount
        )
      })
    ).unwrap()
  })

  it('should successfully process a credit grant without transactionDescription', async () => {
    ;(
      await adminTransaction(async ({ transaction }) => {
        const usageCredit = await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 500,
          livemode: true,
        })

        const command: CreditGrantRecognizedLedgerCommand = {
          organizationId: organization.id,
          livemode: true,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.CreditGrantRecognized,
          payload: {
            usageCredit,
          },
        }

        const timestampBeforeExecution = Date.now()
        const initialBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )

        const result =
          await processCreditGrantRecognizedLedgerCommand(
            command,
            transaction
          )
        const timestampAfterExecution = Date.now()

        expect(result.ledgerEntries.length).toBe(1)

        const ledgerTransaction = result.ledgerTransaction
        expect(ledgerTransaction.description).toBeNull()
        expect(typeof ledgerTransaction.id).toBe('string')
        expect(ledgerTransaction.organizationId).toBe(
          command.organizationId
        )
        expect(ledgerTransaction.livemode).toBe(command.livemode)
        expect(ledgerTransaction.type).toBe(command.type)
        expect(ledgerTransaction.initiatingSourceType).toBe(
          command.type
        )
        expect(ledgerTransaction.initiatingSourceId).toBe(
          usageCredit.id
        )
        expect(ledgerTransaction.subscriptionId).toBe(
          command.subscriptionId
        )

        const ledgerEntry = result.ledgerEntries[0]
        expect(typeof ledgerEntry.id).toBe('string')
        expect(ledgerEntry.ledgerTransactionId).toBe(
          ledgerTransaction.id
        )
        expect(ledgerEntry.ledgerAccountId).toBe(ledgerAccount.id)
        expect(ledgerEntry.subscriptionId).toBe(
          command.subscriptionId
        )
        expect(ledgerEntry.organizationId).toBe(
          command.organizationId
        )
        expect(ledgerEntry.livemode).toBe(command.livemode)
        expect(ledgerEntry.status).toBe(LedgerEntryStatus.Posted)
        expect(ledgerEntry.discardedAt).toBeNull()
        expect(ledgerEntry.direction).toBe(
          LedgerEntryDirection.Credit
        )
        expect(ledgerEntry.entryType).toBe(
          LedgerEntryType.CreditGrantRecognized
        )
        expect(ledgerEntry.amount).toBe(usageCredit.issuedAmount)
        expect(ledgerEntry.description).toBe(
          `Promotional credit ${usageCredit.id} granted.`
        )
        expect(ledgerEntry.sourceUsageCreditId).toBe(usageCredit.id)
        expect(ledgerEntry.billingPeriodId).toBe(
          usageCredit.billingPeriodId
        )
        expect(ledgerEntry.usageMeterId).toBe(
          usageCredit.usageMeterId
        )
        expect(ledgerEntry.claimedByBillingRunId).toBeNull()
        expect(ledgerEntry.metadata).toEqual({
          ledgerCommandType: command.type,
        })
        expect(ledgerEntry.entryTimestamp).toBeTypeOf('number')
        expect(ledgerEntry.entryTimestamp).toBeGreaterThanOrEqual(
          timestampBeforeExecution
        )
        expect(ledgerEntry.entryTimestamp).toBeLessThanOrEqual(
          timestampAfterExecution
        )
        expect(ledgerEntry.sourceUsageEventId).toBeNull()
        expect(ledgerEntry.sourceCreditApplicationId).toBeNull()
        expect(ledgerEntry.sourceCreditBalanceAdjustmentId).toBeNull()
        expect(
          ledgerEntry.sourceBillingPeriodCalculationId
        ).toBeNull()

        const dbLedgerTransaction = await selectLedgerTransactions(
          { id: ledgerTransaction.id },
          transaction
        )
        expect(dbLedgerTransaction.length).toBe(1)
        expect(dbLedgerTransaction[0]).toEqual(ledgerTransaction)

        const dbLedgerEntries = await selectLedgerEntries(
          { id: ledgerEntry.id },
          transaction
        )
        expect(dbLedgerEntries.length).toBe(1)
        expect(dbLedgerEntries[0]).toEqual(ledgerEntry)

        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(finalBalance).toBe(
          initialBalance + usageCredit.issuedAmount
        )
      })
    ).unwrap()
  })

  it('should successfully process a credit grant without transactionMetadata', async () => {
    ;(
      await adminTransaction(async ({ transaction }) => {
        const usageCredit = await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 750,
          livemode: true,
        })

        const command: CreditGrantRecognizedLedgerCommand = {
          organizationId: organization.id,
          livemode: true,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.CreditGrantRecognized,
          transactionDescription: 'Test description',
          payload: {
            usageCredit,
          },
        }

        const initialBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )

        const result =
          await processCreditGrantRecognizedLedgerCommand(
            command,
            transaction
          )

        expect(result.ledgerEntries.length).toBe(1)

        const ledgerTransaction = result.ledgerTransaction
        expect(ledgerTransaction.metadata).toBeNull()
        expect(typeof ledgerTransaction.id).toBe('string')
        expect(ledgerTransaction.organizationId).toBe(
          command.organizationId
        )
        expect(ledgerTransaction.livemode).toBe(command.livemode)
        expect(ledgerTransaction.type).toBe(command.type)
        expect(ledgerTransaction.initiatingSourceType).toBe(
          command.type
        )
        expect(ledgerTransaction.initiatingSourceId).toBe(
          usageCredit.id
        )
        expect(ledgerTransaction.subscriptionId).toBe(
          command.subscriptionId
        )

        const ledgerEntry = result.ledgerEntries[0]
        expect(typeof ledgerEntry.id).toBe('string')
        expect(ledgerEntry.ledgerTransactionId).toBe(
          ledgerTransaction.id
        )
        expect(ledgerEntry.ledgerAccountId).toBe(ledgerAccount.id)
        expect(ledgerEntry.subscriptionId).toBe(
          command.subscriptionId
        )
        expect(ledgerEntry.organizationId).toBe(
          command.organizationId
        )
        expect(ledgerEntry.livemode).toBe(command.livemode)
        expect(ledgerEntry.status).toBe(LedgerEntryStatus.Posted)
        expect(ledgerEntry.direction).toBe(
          LedgerEntryDirection.Credit
        )
        expect(ledgerEntry.entryType).toBe(
          LedgerEntryType.CreditGrantRecognized
        )
        expect(ledgerEntry.amount).toBe(usageCredit.issuedAmount)
        expect(ledgerEntry.description).toBe(
          `Promotional credit ${usageCredit.id} granted.`
        )
        expect(ledgerEntry.sourceUsageCreditId).toBe(usageCredit.id)
        expect(ledgerEntry.metadata).toEqual({
          ledgerCommandType: command.type,
        })

        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(finalBalance).toBe(
          initialBalance + usageCredit.issuedAmount
        )
      })
    ).unwrap()
  })

  it('should successfully process a credit grant without billingPeriodId', async () => {
    ;(
      await adminTransaction(async ({ transaction }) => {
        const usageCredit = await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 250,
          billingPeriodId: null,
          livemode: true,
        })

        const command: CreditGrantRecognizedLedgerCommand = {
          organizationId: organization.id,
          livemode: true,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.CreditGrantRecognized,
          transactionDescription: 'Test description',
          payload: {
            usageCredit,
          },
        }

        const initialBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )

        const result =
          await processCreditGrantRecognizedLedgerCommand(
            command,
            transaction
          )

        expect(result.ledgerEntries.length).toBe(1)

        const ledgerTransaction = result.ledgerTransaction
        expect(typeof ledgerTransaction.id).toBe('string')
        expect(ledgerTransaction.organizationId).toBe(
          command.organizationId
        )
        expect(ledgerTransaction.livemode).toBe(command.livemode)
        expect(ledgerTransaction.type).toBe(command.type)
        expect(ledgerTransaction.initiatingSourceType).toBe(
          command.type
        )
        expect(ledgerTransaction.initiatingSourceId).toBe(
          usageCredit.id
        )
        expect(ledgerTransaction.subscriptionId).toBe(
          command.subscriptionId
        )

        const ledgerEntry = result.ledgerEntries[0]
        expect(ledgerEntry.billingPeriodId).toBeNull()
        expect(typeof ledgerEntry.id).toBe('string')
        expect(ledgerEntry.ledgerTransactionId).toBe(
          ledgerTransaction.id
        )
        expect(ledgerEntry.ledgerAccountId).toBe(ledgerAccount.id)
        expect(ledgerEntry.subscriptionId).toBe(
          command.subscriptionId
        )
        expect(ledgerEntry.organizationId).toBe(
          command.organizationId
        )
        expect(ledgerEntry.livemode).toBe(command.livemode)
        expect(ledgerEntry.status).toBe(LedgerEntryStatus.Posted)
        expect(ledgerEntry.direction).toBe(
          LedgerEntryDirection.Credit
        )
        expect(ledgerEntry.entryType).toBe(
          LedgerEntryType.CreditGrantRecognized
        )
        expect(ledgerEntry.amount).toBe(usageCredit.issuedAmount)
        expect(ledgerEntry.description).toBe(
          `Promotional credit ${usageCredit.id} granted.`
        )
        expect(ledgerEntry.sourceUsageCreditId).toBe(usageCredit.id)
        expect(ledgerEntry.usageMeterId).toBe(
          usageCredit.usageMeterId
        )

        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(finalBalance).toBe(
          initialBalance + usageCredit.issuedAmount
        )
      })
    ).unwrap()
  })

  it('should throw an error when ledger transaction insertion fails', async () => {
    const usageCredit = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter.id,
      creditType: UsageCreditType.Grant,
      issuedAmount: 100,
      livemode: true,
    })

    const invalidSubscriptionId = `sub_${core.nanoid()}`
    const command: CreditGrantRecognizedLedgerCommand = {
      organizationId: organization.id,
      livemode: true,
      subscriptionId: invalidSubscriptionId,
      type: LedgerTransactionType.CreditGrantRecognized,
      payload: {
        usageCredit,
      },
    }

    await expect(
      adminTransaction(async ({ transaction }) => {
        return await processCreditGrantRecognizedLedgerCommand(
          command,
          transaction
        )
      })
    ).rejects.toThrowError('No subscriptions found with id')

    // Verify that no partial/rogue transactions were persisted due to the error.
    // This ensures the database transaction was properly rolled back.
    const rogueTransactions = (
      await adminTransaction(async ({ transaction }) => {
        return selectLedgerTransactions(
          {
            organizationId: organization.id,
            subscriptionId: invalidSubscriptionId,
          },
          transaction
        )
      })
    ).unwrap()
    expect(rogueTransactions.length).toBe(0)
  })

  it('should throw an error when usage credit has no usageMeterId', async () => {
    ;(
      await adminTransaction(async ({ transaction }) => {
        const usageCredit = await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 100,
          livemode: true,
        })

        const usageCreditWithoutMeterId = {
          ...usageCredit,
          usageMeterId: null,
        } as UsageCredit.Record & { usageMeterId: null }

        const command: CreditGrantRecognizedLedgerCommand = {
          organizationId: organization.id,
          livemode: true,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.CreditGrantRecognized,
          payload: {
            usageCredit: usageCreditWithoutMeterId,
          },
        }

        await expect(
          processCreditGrantRecognizedLedgerCommand(
            command,
            transaction
          )
        ).rejects.toThrow(
          'Cannot process Credit Grant Recognized command: usage credit must have a usageMeterId'
        )

        // Note: A ledger transaction may be created before the error is thrown,
        // but no ledger entries should be created
        const ledgerEntries = await selectLedgerEntries(
          {
            organizationId: organization.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            sourceUsageCreditId: usageCredit.id,
          },
          transaction
        )
        expect(ledgerEntries.length).toBe(0)
      })
    ).unwrap()
  })

  it('should successfully process a credit grant with livemode true', async () => {
    ;(
      await adminTransaction(async ({ transaction }) => {
        const scenarioData = await setupUsageLedgerScenario({
          livemode: true,
        })
        const testLedgerAccount = scenarioData.ledgerAccount

        const usageCredit = await setupUsageCredit({
          organizationId: scenarioData.organization.id,
          subscriptionId: scenarioData.subscription.id,
          usageMeterId: scenarioData.usageMeter.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 2000,
          livemode: true,
        })

        const command: CreditGrantRecognizedLedgerCommand = {
          organizationId: scenarioData.organization.id,
          livemode: true,
          subscriptionId: scenarioData.subscription.id,
          type: LedgerTransactionType.CreditGrantRecognized,
          payload: {
            usageCredit,
          },
        }

        const initialBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: testLedgerAccount.id },
            'available',
            transaction
          )

        const result =
          await processCreditGrantRecognizedLedgerCommand(
            command,
            transaction
          )

        expect(result.ledgerEntries.length).toBe(1)

        const ledgerTransaction = result.ledgerTransaction
        expect(ledgerTransaction.livemode).toBe(true)
        expect(typeof ledgerTransaction.id).toBe('string')
        expect(ledgerTransaction.organizationId).toBe(
          command.organizationId
        )
        expect(ledgerTransaction.type).toBe(command.type)
        expect(ledgerTransaction.initiatingSourceType).toBe(
          command.type
        )
        expect(ledgerTransaction.initiatingSourceId).toBe(
          usageCredit.id
        )

        const ledgerEntry = result.ledgerEntries[0]
        expect(typeof ledgerEntry.id).toBe('string')
        expect(ledgerEntry.livemode).toBe(true)
        expect(typeof ledgerEntry.id).toBe('string')
        expect(ledgerEntry.ledgerTransactionId).toBe(
          ledgerTransaction.id
        )
        expect(ledgerEntry.ledgerAccountId).toBe(testLedgerAccount.id)
        expect(ledgerEntry.amount).toBe(usageCredit.issuedAmount)

        const dbLedgerTransaction = await selectLedgerTransactions(
          { id: ledgerTransaction.id },
          transaction
        )
        expect(dbLedgerTransaction.length).toBe(1)
        expect(dbLedgerTransaction[0].livemode).toBe(true)

        const dbLedgerEntries = await selectLedgerEntries(
          { id: ledgerEntry.id },
          transaction
        )
        expect(dbLedgerEntries.length).toBe(1)
        expect(dbLedgerEntries[0].livemode).toBe(true)

        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: testLedgerAccount.id },
            'available',
            transaction
          )
        expect(finalBalance).toBe(
          initialBalance + usageCredit.issuedAmount
        )
      })
    ).unwrap()
  })

  it('should successfully process a credit grant with livemode false', async () => {
    ;(
      await adminTransaction(async ({ transaction }) => {
        const scenarioData = await setupUsageLedgerScenario({
          livemode: false,
        })
        const testLedgerAccount = scenarioData.ledgerAccount

        const usageCredit = await setupUsageCredit({
          organizationId: scenarioData.organization.id,
          subscriptionId: scenarioData.subscription.id,
          usageMeterId: scenarioData.usageMeter.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 1500,
          livemode: false,
        })

        const command: CreditGrantRecognizedLedgerCommand = {
          organizationId: scenarioData.organization.id,
          livemode: false,
          subscriptionId: scenarioData.subscription.id,
          type: LedgerTransactionType.CreditGrantRecognized,
          payload: {
            usageCredit,
          },
        }

        const initialBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: testLedgerAccount.id },
            'available',
            transaction
          )

        const result =
          await processCreditGrantRecognizedLedgerCommand(
            command,
            transaction
          )

        expect(result.ledgerEntries.length).toBe(1)

        const ledgerTransaction = result.ledgerTransaction
        expect(ledgerTransaction.livemode).toBe(false)
        expect(typeof ledgerTransaction.id).toBe('string')
        expect(ledgerTransaction.organizationId).toBe(
          command.organizationId
        )
        expect(ledgerTransaction.type).toBe(command.type)
        expect(ledgerTransaction.initiatingSourceType).toBe(
          command.type
        )
        expect(ledgerTransaction.initiatingSourceId).toBe(
          usageCredit.id
        )

        const ledgerEntry = result.ledgerEntries[0]
        expect(typeof ledgerEntry.id).toBe('string')
        expect(ledgerEntry.livemode).toBe(false)
        expect(typeof ledgerEntry.id).toBe('string')
        expect(ledgerEntry.ledgerTransactionId).toBe(
          ledgerTransaction.id
        )
        expect(ledgerEntry.ledgerAccountId).toBe(testLedgerAccount.id)
        expect(ledgerEntry.amount).toBe(usageCredit.issuedAmount)

        const dbLedgerTransaction = await selectLedgerTransactions(
          { id: ledgerTransaction.id },
          transaction
        )
        expect(dbLedgerTransaction.length).toBe(1)
        expect(dbLedgerTransaction[0].livemode).toBe(false)

        const dbLedgerEntries = await selectLedgerEntries(
          { id: ledgerEntry.id },
          transaction
        )
        expect(dbLedgerEntries.length).toBe(1)
        expect(dbLedgerEntries[0].livemode).toBe(false)

        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: testLedgerAccount.id },
            'available',
            transaction
          )
        expect(finalBalance).toBe(
          initialBalance + usageCredit.issuedAmount
        )
      })
    ).unwrap()
  })

  // Note: Zero amount test removed because the schema validation requires issuedAmount > 0
  // The minimum valid amount is 1, which is tested in "should successfully process a credit grant with small amount"

  it('should successfully process a credit grant with small amount', async () => {
    ;(
      await adminTransaction(async ({ transaction }) => {
        const usageCredit = await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 1,
          livemode: true,
        })

        const command: CreditGrantRecognizedLedgerCommand = {
          organizationId: organization.id,
          livemode: true,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.CreditGrantRecognized,
          payload: {
            usageCredit,
          },
        }

        const initialBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )

        const result =
          await processCreditGrantRecognizedLedgerCommand(
            command,
            transaction
          )

        expect(result.ledgerEntries.length).toBe(1)

        const ledgerTransaction = result.ledgerTransaction
        expect(typeof ledgerTransaction.id).toBe('string')
        expect(ledgerTransaction.organizationId).toBe(
          command.organizationId
        )
        expect(ledgerTransaction.livemode).toBe(command.livemode)
        expect(ledgerTransaction.type).toBe(command.type)
        expect(ledgerTransaction.initiatingSourceType).toBe(
          command.type
        )
        expect(ledgerTransaction.initiatingSourceId).toBe(
          usageCredit.id
        )

        const ledgerEntry = result.ledgerEntries[0]
        expect(ledgerEntry.amount).toBe(1)
        expect(typeof ledgerEntry.id).toBe('string')
        expect(ledgerEntry.ledgerTransactionId).toBe(
          ledgerTransaction.id
        )
        expect(ledgerEntry.ledgerAccountId).toBe(ledgerAccount.id)

        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(finalBalance).toBe(initialBalance + 1)
      })
    ).unwrap()
  })

  it('should successfully process a credit grant with large amount', async () => {
    ;(
      await adminTransaction(async ({ transaction }) => {
        const usageCredit = await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 999999999,
          livemode: true,
        })

        const command: CreditGrantRecognizedLedgerCommand = {
          organizationId: organization.id,
          livemode: true,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.CreditGrantRecognized,
          payload: {
            usageCredit,
          },
        }

        const initialBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )

        const result =
          await processCreditGrantRecognizedLedgerCommand(
            command,
            transaction
          )

        expect(result.ledgerEntries.length).toBe(1)

        const ledgerTransaction = result.ledgerTransaction
        expect(typeof ledgerTransaction.id).toBe('string')
        expect(ledgerTransaction.organizationId).toBe(
          command.organizationId
        )
        expect(ledgerTransaction.livemode).toBe(command.livemode)
        expect(ledgerTransaction.type).toBe(command.type)
        expect(ledgerTransaction.initiatingSourceType).toBe(
          command.type
        )
        expect(ledgerTransaction.initiatingSourceId).toBe(
          usageCredit.id
        )

        const ledgerEntry = result.ledgerEntries[0]
        expect(ledgerEntry.amount).toBe(999999999)
        expect(typeof ledgerEntry.id).toBe('string')
        expect(ledgerEntry.ledgerTransactionId).toBe(
          ledgerTransaction.id
        )
        expect(ledgerEntry.ledgerAccountId).toBe(ledgerAccount.id)

        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(finalBalance).toBe(initialBalance + 999999999)
      })
    ).unwrap()
  })

  it('should successfully process a credit grant with different usage meter', async () => {
    ;(
      await adminTransaction(async ({ transaction }) => {
        const secondUsageMeter = await setupUsageMeter({
          organizationId: organization.id,
          name: 'Second Usage Meter',
          pricingModelId: pricingModel.id,
          livemode: true,
        })

        const secondLedgerAccount = await setupLedgerAccount({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: secondUsageMeter.id,
          livemode: true,
        })

        const usageCredit = await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: secondUsageMeter.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 3000,
          livemode: true,
        })

        const command: CreditGrantRecognizedLedgerCommand = {
          organizationId: organization.id,
          livemode: true,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.CreditGrantRecognized,
          payload: {
            usageCredit,
          },
        }

        const initialBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: secondLedgerAccount.id },
            'available',
            transaction
          )

        const result =
          await processCreditGrantRecognizedLedgerCommand(
            command,
            transaction
          )

        expect(result.ledgerEntries.length).toBe(1)

        const ledgerEntry = result.ledgerEntries[0]
        expect(ledgerEntry.usageMeterId).toBe(secondUsageMeter.id)
        expect(ledgerEntry.ledgerAccountId).toBe(
          secondLedgerAccount.id
        )

        const ledgerTransaction = result.ledgerTransaction
        expect(typeof ledgerTransaction.id).toBe('string')
        expect(ledgerTransaction.organizationId).toBe(
          command.organizationId
        )
        expect(ledgerTransaction.livemode).toBe(command.livemode)
        expect(ledgerTransaction.type).toBe(command.type)
        expect(ledgerTransaction.initiatingSourceType).toBe(
          command.type
        )
        expect(ledgerTransaction.initiatingSourceId).toBe(
          usageCredit.id
        )

        expect(typeof ledgerEntry.id).toBe('string')
        expect(ledgerEntry.ledgerTransactionId).toBe(
          ledgerTransaction.id
        )
        expect(ledgerEntry.amount).toBe(usageCredit.issuedAmount)

        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: secondLedgerAccount.id },
            'available',
            transaction
          )
        expect(finalBalance).toBe(
          initialBalance + usageCredit.issuedAmount
        )
      })
    ).unwrap()
  })

  it('should use existing ledger account when one already exists', async () => {
    ;(
      await adminTransaction(async ({ transaction }) => {
        // The ledgerAccount from beforeEach already exists for this subscription and usageMeter
        // The function should find and use it rather than creating a duplicate

        const usageCredit = await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 4000,
          livemode: true,
        })

        const command: CreditGrantRecognizedLedgerCommand = {
          organizationId: organization.id,
          livemode: true,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.CreditGrantRecognized,
          payload: {
            usageCredit,
          },
        }

        const initialBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )

        const result =
          await processCreditGrantRecognizedLedgerCommand(
            command,
            transaction
          )

        expect(result.ledgerEntries.length).toBe(1)

        const ledgerEntry = result.ledgerEntries[0]
        // Should use the existing ledger account from beforeEach
        expect(ledgerEntry.ledgerAccountId).toBe(ledgerAccount.id)

        const ledgerTransaction = result.ledgerTransaction
        expect(typeof ledgerTransaction.id).toBe('string')
        expect(ledgerTransaction.organizationId).toBe(
          command.organizationId
        )
        expect(ledgerTransaction.livemode).toBe(command.livemode)
        expect(ledgerTransaction.type).toBe(command.type)
        expect(ledgerTransaction.initiatingSourceType).toBe(
          command.type
        )
        expect(ledgerTransaction.initiatingSourceId).toBe(
          usageCredit.id
        )

        expect(typeof ledgerEntry.id).toBe('string')
        expect(ledgerEntry.ledgerTransactionId).toBe(
          ledgerTransaction.id
        )
        expect(ledgerEntry.amount).toBe(usageCredit.issuedAmount)

        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(finalBalance).toBe(
          initialBalance + usageCredit.issuedAmount
        )
      })
    ).unwrap()
  })

  it('should correctly process credit grant with existing ledger entries', async () => {
    ;(
      await adminTransaction(async ({ transaction }) => {
        const existingUsageCredit = await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 500,
          livemode: true,
        })

        const scenarioData = await setupUsageLedgerScenario({
          quickEntries: [
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: 500,
              sourceUsageCreditId: existingUsageCredit.id,
            },
          ],
        })
        const testLedgerAccount = scenarioData.ledgerAccount

        const usageCredit = await setupUsageCredit({
          organizationId: scenarioData.organization.id,
          subscriptionId: scenarioData.subscription.id,
          usageMeterId: scenarioData.usageMeter.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 1000,
          livemode: true,
        })

        const command: CreditGrantRecognizedLedgerCommand = {
          organizationId: scenarioData.organization.id,
          livemode: true,
          subscriptionId: scenarioData.subscription.id,
          type: LedgerTransactionType.CreditGrantRecognized,
          payload: {
            usageCredit,
          },
        }

        const initialBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: testLedgerAccount.id },
            'available',
            transaction
          )

        const result =
          await processCreditGrantRecognizedLedgerCommand(
            command,
            transaction
          )

        expect(result.ledgerEntries.length).toBe(1)

        const ledgerEntry = result.ledgerEntries[0]
        expect(typeof ledgerEntry.id).toBe('string')
        expect(ledgerEntry.ledgerTransactionId).toBe(
          result.ledgerTransaction.id
        )
        expect(ledgerEntry.ledgerAccountId).toBe(testLedgerAccount.id)
        expect(ledgerEntry.amount).toBe(usageCredit.issuedAmount)

        const ledgerTransaction = result.ledgerTransaction
        expect(typeof ledgerTransaction.id).toBe('string')
        expect(ledgerTransaction.organizationId).toBe(
          command.organizationId
        )
        expect(ledgerTransaction.livemode).toBe(command.livemode)
        expect(ledgerTransaction.type).toBe(command.type)
        expect(ledgerTransaction.initiatingSourceType).toBe(
          command.type
        )
        expect(ledgerTransaction.initiatingSourceId).toBe(
          usageCredit.id
        )

        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: testLedgerAccount.id },
            'available',
            transaction
          )
        expect(finalBalance).toBe(
          initialBalance + usageCredit.issuedAmount
        )
      })
    ).unwrap()
  })
})
