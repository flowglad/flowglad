import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { eq } from 'drizzle-orm'
import {
  setupBillingRun,
  setupInvoice,
  setupInvoiceLineItem,
  setupLedgerAccount,
  setupLedgerEntries,
  setupLedgerTransaction,
  setupUsageCredit,
  setupUsageEvent,
  setupUsageLedgerScenario,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { SettleInvoiceUsageCostsLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import {
  processSettleInvoiceUsageCostsLedgerCommand,
  usageCreditInsertFromInvoiceLineItem,
} from '@/db/ledgerManager/settleInvoiceUsageCostsLedgerCommand'
import type { BillingRun } from '@/db/schema/billingRuns'
import type { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import type { Invoice } from '@/db/schema/invoices'
import type { LedgerAccount } from '@/db/schema/ledgerAccounts'
import {
  type LedgerEntry,
  ledgerEntries,
} from '@/db/schema/ledgerEntries'
import { ledgerTransactions } from '@/db/schema/ledgerTransactions'
import type { Organization } from '@/db/schema/organizations'
import type { Subscription } from '@/db/schema/subscriptions'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { selectLedgerTransactions } from '@/db/tableMethods/ledgerTransactionMethods'
import {
  InvoiceStatus,
  LedgerEntryType,
  LedgerTransactionType,
  SubscriptionItemType,
  UsageCreditSourceReferenceType,
  UsageCreditType,
} from '@/types'
import type { PricingModel } from '../schema/pricingModels'
import { updateInvoice } from '../tableMethods/invoiceMethods'
import { aggregateBalanceForLedgerAccountFromEntries } from '../tableMethods/ledgerEntryMethods'

describe('settleInvoiceUsageCostsLedgerCommand', () => {
  let organization: Organization.Record
  let subscription: Subscription.Record
  let usageMeter: UsageMeter.Record
  let ledgerAccount: LedgerAccount.Record
  let billingRun: BillingRun.Record
  let invoice: Invoice.Record
  let usageCostLedgerEntry: LedgerEntry.Record
  let usageInvoiceLineItem: InvoiceLineItem.Record
  let pricingModel: PricingModel.Record
  beforeEach(async () => {
    // 1. Use setupUsageLedgerScenario to create a base state with a usage cost.
    const scenario = await setupUsageLedgerScenario({
      usageEventAmounts: [1500], // This creates a usage event and a corresponding usage_cost ledger entry
    })
    organization = scenario.organization
    pricingModel = scenario.pricingModel
    subscription = scenario.subscription
    usageMeter = scenario.usageMeter
    ledgerAccount = scenario.ledgerAccount
    usageCostLedgerEntry = scenario.ledgerEntries.find(
      (le) => le.entryType === LedgerEntryType.UsageCost
    )!

    // 2. Create a BillingRun to represent the process that "found" this usage cost.
    billingRun = await setupBillingRun({
      subscriptionId: subscription.id,
      billingPeriodId: scenario.billingPeriod.id,
      paymentMethodId: scenario.paymentMethod.id,
    })

    // 3. Link the usage cost entry to the billing run. This simulates the tabulation process.
    await adminTransaction(async ({ transaction }) => {
      await transaction
        .update(ledgerEntries)
        .set({ claimedByBillingRunId: billingRun.id })
        .where(eq(ledgerEntries.id, usageCostLedgerEntry.id))
    })
    // Refresh the local record to have the updated field
    usageCostLedgerEntry.claimedByBillingRunId = billingRun.id

    // 4. Create a paid Invoice that resulted from this billing run.
    invoice = await setupInvoice({
      organizationId: organization.id,
      customerId: scenario.customer.id,
      priceId: scenario.price.id,
      status: InvoiceStatus.Paid,
    })
    invoice = await adminTransaction(async ({ transaction }) => {
      return await updateInvoice(
        {
          ...invoice,
          billingRunId: billingRun.id,
        },
        transaction
      )
    })
    // 5. Create the specific InvoiceLineItem that represents the usage cost on the invoice.
    usageInvoiceLineItem = await setupInvoiceLineItem({
      invoiceId: invoice.id,
      priceId: scenario.price.id,
      quantity: 1,
      ledgerAccountId: ledgerAccount.id,
      type: SubscriptionItemType.Usage,
      ledgerAccountCredit: usageCostLedgerEntry.amount, // The amount that credits the ledger
      billingRunId: billingRun.id,
    })
  })

  describe('usageCreditInsertFromInvoiceLineItem', () => {
    it('should correctly create a usage credit insert from a valid usage line item', () => {
      // setup:
      // The global beforeEach already creates a valid usageInvoiceLineItem and ledgerAccount.
      // execute:
      const usageCreditInsert = usageCreditInsertFromInvoiceLineItem(
        usageInvoiceLineItem,
        ledgerAccount
      )
      // expects:
      expect(usageCreditInsert.creditType).toBe(
        UsageCreditType.Payment
      )
      expect(usageCreditInsert.issuedAmount).toBe(
        usageInvoiceLineItem.ledgerAccountCredit!
      )
      expect(usageCreditInsert.sourceReferenceType).toBe(
        UsageCreditSourceReferenceType.InvoiceSettlement
      )
      expect(usageCreditInsert.sourceReferenceId).toBe(
        usageInvoiceLineItem.invoiceId
      )
      expect(usageCreditInsert.usageMeterId).toBe(
        ledgerAccount.usageMeterId
      )
      expect(usageCreditInsert.expiresAt).toBeNull()
    })

    it('should throw an error if the line item is not of type Usage', () => {
      // setup:
      const staticLineItem = {
        ...usageInvoiceLineItem,
        type: SubscriptionItemType.Static,
      } as InvoiceLineItem.Record
      // execute & expects:
      expect(() =>
        usageCreditInsertFromInvoiceLineItem(
          staticLineItem,
          ledgerAccount
        )
      ).toThrowError('Invoice line item type static is not supported')
    })

    it('should throw an error if the ledger account ID does not match', () => {
      // setup:
      const mismatchedLedgerAccount = {
        ...ledgerAccount,
        id: 'la_mismatched',
      }
      // execute & expects:
      expect(() =>
        usageCreditInsertFromInvoiceLineItem(
          usageInvoiceLineItem,
          mismatchedLedgerAccount
        )
      ).toThrowError('Ledger account ID la_mismatched does not match')
    })
  })

  describe('processSettleInvoiceUsageCostsLedgerCommand', () => {
    it('should successfully settle an invoice with a single usage meter', async () => {
      // setup:
      // The beforeEach block sets up a paid invoice with one usage line item.
      const command: SettleInvoiceUsageCostsLedgerCommand = {
        organizationId: organization.id,
        subscriptionId: subscription.id,
        livemode: subscription.livemode,
        type: LedgerTransactionType.SettleInvoiceUsageCosts,
        payload: {
          invoice,
          invoiceLineItems: [usageInvoiceLineItem],
        },
      }

      // execute:
      const {
        ledgerTransaction,
        ledgerEntries: createdLedgerEntries,
      } = await adminTransaction(async ({ transaction }) => {
        return await processSettleInvoiceUsageCostsLedgerCommand(
          command,
          transaction
        )
      })

      // expects:
      // 1. A single LedgerTransaction of type SettleInvoiceUsageCosts is created.
      expect(ledgerTransaction.type).toBe(
        LedgerTransactionType.SettleInvoiceUsageCosts
      )
      expect(ledgerTransaction.initiatingSourceId).toBe(invoice.id)

      // 2. One UsageCredit record is created.
      // 3. One UsageCreditApplication record is created.
      // We can infer these were created by checking the created ledger entries' sources.

      // 4. Exactly 3 LedgerEntry records are created
      expect(createdLedgerEntries).toHaveLength(3)

      const creditGrantEntry = createdLedgerEntries.find(
        (le) => le.entryType === LedgerEntryType.CreditGrantRecognized
      )!
      const debitAppEntry = createdLedgerEntries.find(
        (le) =>
          le.entryType ===
          LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance
      )!
      const creditAppEntry = createdLedgerEntries.find(
        (le) =>
          le.entryType ===
          LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost
      )!

      // Assert amounts are correct
      expect(creditGrantEntry.amount).toBe(
        usageInvoiceLineItem.ledgerAccountCredit!
      )
      expect(debitAppEntry.amount).toBe(
        usageInvoiceLineItem.ledgerAccountCredit!
      )
      expect(creditAppEntry.amount).toBe(
        usageInvoiceLineItem.ledgerAccountCredit!
      )

      // 5. All 3 ledger entries are linked to the created ledger transaction.
      expect(creditGrantEntry.ledgerTransactionId).toBe(
        ledgerTransaction.id
      )
      expect(debitAppEntry.ledgerTransactionId).toBe(
        ledgerTransaction.id
      )
      expect(creditAppEntry.ledgerTransactionId).toBe(
        ledgerTransaction.id
      )

      // And linked to each other via source IDs
      expect(debitAppEntry.sourceUsageCreditId).toBe(
        creditGrantEntry.sourceUsageCreditId
      )
      expect(creditAppEntry.sourceUsageCreditId).toBe(
        creditGrantEntry.sourceUsageCreditId
      )
      expect(typeof debitAppEntry.sourceCreditApplicationId).toBe(
        'string'
      )
      expect(creditAppEntry.sourceCreditApplicationId).toBe(
        debitAppEntry.sourceCreditApplicationId
      )

      // 6. The ledger balance for this usage meter should be zeroed out.
      const finalBalance = await adminTransaction(
        async ({ transaction }) => {
          return await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        }
      )
      expect(finalBalance).toBe(0)
    })

    it('should successfully settle an invoice with multiple usage meters', async () => {
      // setup:
      const { customer, billingPeriod, price } =
        await setupUsageLedgerScenario({})
      // 1. Create a second usage meter and ledger account for the same subscription.
      const usageMeter2 = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Second Usage Meter',
        pricingModelId: pricingModel.id,
      })
      const ledgerAccount2 = await setupLedgerAccount({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter2.id,
        livemode: subscription.livemode,
      })

      // 2. Create a second, real usage_cost ledger entry and link it to the same billing run.
      const usageEvent2 = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter2.id,
        amount: 500,
        priceId: price.id,
        billingPeriodId: billingPeriod.id,
        transactionId: 'ltxn_dummy_for_setup',
        customerId: customer.id,
      })
      const usageCost2Transaction = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.UsageEventProcessed,
      })
      const [usageCostLedgerEntry2] = await setupLedgerEntries({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerAccountId: ledgerAccount2.id,
        ledgerTransactionId: usageCost2Transaction.id,
        usageMeterId: ledgerAccount2.usageMeterId!,
        entries: [
          {
            entryType: LedgerEntryType.UsageCost,
            sourceUsageEventId: usageEvent2.id,
            amount: usageEvent2.amount,
          },
        ],
      })
      await adminTransaction(async ({ transaction }) => {
        await transaction
          .update(ledgerEntries)
          .set({ claimedByBillingRunId: billingRun.id })
          .where(eq(ledgerEntries.id, usageCostLedgerEntry2.id))
      })

      // 3. Create a second invoice line item for this new cost.
      const usageInvoiceLineItem2 = await setupInvoiceLineItem({
        invoiceId: invoice.id,
        priceId: price.id,
        quantity: 1,
        ledgerAccountId: ledgerAccount2.id,
        type: SubscriptionItemType.Usage,
        ledgerAccountCredit: usageCostLedgerEntry2.amount,
        billingRunId: billingRun.id,
      })

      const command: SettleInvoiceUsageCostsLedgerCommand = {
        organizationId: organization.id,
        subscriptionId: subscription.id,
        livemode: subscription.livemode,
        type: LedgerTransactionType.SettleInvoiceUsageCosts,
        payload: {
          invoice,
          invoiceLineItems: [
            usageInvoiceLineItem,
            usageInvoiceLineItem2,
          ],
        },
      }

      // execute:
      const {
        ledgerTransaction,
        ledgerEntries: createdLedgerEntries,
      } = await adminTransaction(async ({ transaction }) => {
        return await processSettleInvoiceUsageCostsLedgerCommand(
          command,
          transaction
        )
      })

      // expects:
      expect(ledgerTransaction.type).toBe(
        LedgerTransactionType.SettleInvoiceUsageCosts
      )
      expect(createdLedgerEntries).toHaveLength(6) // 3 for each line item

      // Verify counts of each entry type
      const creditGrantEntries = createdLedgerEntries.filter(
        (le) => le.entryType === LedgerEntryType.CreditGrantRecognized
      )
      const debitAppEntries = createdLedgerEntries.filter(
        (le) =>
          le.entryType ===
          LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance
      )
      const creditAppEntries = createdLedgerEntries.filter(
        (le) =>
          le.entryType ===
          LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost
      )

      expect(creditGrantEntries).toHaveLength(2)
      expect(debitAppEntries).toHaveLength(2)
      expect(creditAppEntries).toHaveLength(2)

      const finalBalance1 = await adminTransaction(
        async ({ transaction }) => {
          return await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        }
      )
      const finalBalance2 = await adminTransaction(
        async ({ transaction }) => {
          return await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount2.id },
            'available',
            transaction
          )
        }
      )
      expect(finalBalance1).toBe(0)
      expect(finalBalance2).toBe(0)
    })

    it('should correctly process an invoice with mixed (usage and static) line items', async () => {
      // setup:
      // 1. Create a static (non-usage) invoice line item.
      const { price } = await setupUsageLedgerScenario({})
      const staticInvoiceLineItem = await setupInvoiceLineItem({
        invoiceId: invoice.id,
        priceId: price.id,
        type: SubscriptionItemType.Static,
        quantity: 1,
        billingRunId: billingRun.id,
      })

      // 2. Construct the command with both the original usage line item and the new static one.
      const command: SettleInvoiceUsageCostsLedgerCommand = {
        organizationId: organization.id,
        subscriptionId: subscription.id,
        livemode: subscription.livemode,
        type: LedgerTransactionType.SettleInvoiceUsageCosts,
        payload: {
          invoice,
          invoiceLineItems: [
            usageInvoiceLineItem,
            staticInvoiceLineItem,
          ],
        },
      }

      // execute:
      const {
        ledgerTransaction,
        ledgerEntries: createdLedgerEntries,
      } = await adminTransaction(async ({ transaction }) => {
        return await processSettleInvoiceUsageCostsLedgerCommand(
          command,
          transaction
        )
      })

      // expects:
      // The command should ignore the static line item and only process the usage one.
      expect(ledgerTransaction.type).toBe(
        LedgerTransactionType.SettleInvoiceUsageCosts
      )
      expect(createdLedgerEntries).toHaveLength(3) // Only the 3 entries for the single usage item

      const finalBalance = await adminTransaction(
        async ({ transaction }) => {
          return await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        }
      )
      expect(finalBalance).toBe(0)
    })

    it('should be idempotent and not create duplicate records on re-execution', async () => {
      // setup:
      // 1. Construct the command.
      const command: SettleInvoiceUsageCostsLedgerCommand = {
        organizationId: organization.id,
        subscriptionId: subscription.id,
        livemode: subscription.livemode,
        type: LedgerTransactionType.SettleInvoiceUsageCosts,
        payload: {
          invoice,
          invoiceLineItems: [usageInvoiceLineItem],
        },
      }
      // 2. Successfully execute the command once.
      await adminTransaction(async ({ transaction }) => {
        await processSettleInvoiceUsageCostsLedgerCommand(
          command,
          transaction
        )
      })

      // execute & expects:
      // 3. Calling the command processing function a second time should fail.
      await expect(
        adminTransaction(async ({ transaction }) => {
          await processSettleInvoiceUsageCostsLedgerCommand(
            command,
            transaction
          )
        })
      ).rejects.toThrow()

      // 4. Query the database to ensure no duplicate records were created.
      const txns = await adminTransaction(async ({ transaction }) => {
        return transaction
          .select()
          .from(ledgerTransactions)
          .where(
            eq(ledgerTransactions.initiatingSourceId, invoice.id)
          )
      })
      expect(txns).toHaveLength(1) // Only the first transaction should exist.
    })

    it('should throw an error if there is a data scope mismatch', async () => {
      // setup:
      // The beforeEach creates invoice and line items for the default organization.
      // 1. Create a second, valid organization to use for the mismatch.
      const otherOrgSetup = await setupUsageLedgerScenario({})

      // 2. Construct the command but with a mismatched organizationId.
      const command: SettleInvoiceUsageCostsLedgerCommand = {
        organizationId: otherOrgSetup.organization.id, // Use a real, but incorrect, org ID
        subscriptionId: subscription.id,
        livemode: subscription.livemode,
        type: LedgerTransactionType.SettleInvoiceUsageCosts,
        payload: {
          invoice,
          invoiceLineItems: [usageInvoiceLineItem],
        },
      }

      // execute & expects:
      await expect(
        adminTransaction(async ({ transaction }) => {
          await processSettleInvoiceUsageCostsLedgerCommand(
            command,
            transaction
          )
        })
      ).rejects.toThrowError(
        'Expected 1 ledger accounts for usage line items, but got 0'
      )

      const finalBalance = await adminTransaction(
        async ({ transaction }) => {
          return await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        }
      )
      // The original usage cost is unsettled.
      expect(finalBalance).toBe(-usageCostLedgerEntry.amount)
    })

    it('should handle an invoice with no usage line items gracefully', async () => {
      // setup:
      // 1. Create a static (non-usage) invoice line item.
      const { price } = await setupUsageLedgerScenario({})
      const staticInvoiceLineItem = await setupInvoiceLineItem({
        invoiceId: invoice.id,
        priceId: price.id,
        type: SubscriptionItemType.Static,
        quantity: 1,
        billingRunId: billingRun.id,
      })
      // 2. Construct the command with only the static line item.
      const command: SettleInvoiceUsageCostsLedgerCommand = {
        organizationId: organization.id,
        subscriptionId: subscription.id,
        livemode: subscription.livemode,
        type: LedgerTransactionType.SettleInvoiceUsageCosts,
        payload: {
          invoice,
          invoiceLineItems: [staticInvoiceLineItem],
        },
      }

      // execute:
      const {
        ledgerTransaction,
        ledgerEntries: createdLedgerEntries,
      } = await adminTransaction(async ({ transaction }) => {
        return await processSettleInvoiceUsageCostsLedgerCommand(
          command,
          transaction
        )
      })

      // expects:
      expect(ledgerTransaction.id).toEqual(expect.any(String))
      expect(createdLedgerEntries).toHaveLength(0)

      const finalBalance = await adminTransaction(
        async ({ transaction }) => {
          return await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        }
      )
      // The original usage cost is unsettled.
      expect(finalBalance).toBe(-usageCostLedgerEntry.amount)
    })

    it('should correctly propagate livemode from the command to all created records', async () => {
      // setup:
      // 1. Create a full scenario in test mode.
      const scenario = await setupUsageLedgerScenario({
        usageEventAmounts: [1500],
        livemode: false,
      })
      const billingRunTest = await setupBillingRun({
        subscriptionId: scenario.subscription.id,
        billingPeriodId: scenario.billingPeriod.id,
        paymentMethodId: scenario.paymentMethod.id,
        livemode: false,
      })
      const invoiceTest = await adminTransaction(
        async ({ transaction }) => {
          const inv = await setupInvoice({
            organizationId: scenario.organization.id,
            customerId: scenario.customer.id,
            priceId: scenario.price.id,
            status: InvoiceStatus.Paid,
            livemode: false,
          })
          return await updateInvoice(
            { ...inv, billingRunId: billingRunTest.id },
            transaction
          )
        }
      )
      const usageInvoiceLineItemTest = await setupInvoiceLineItem({
        invoiceId: invoiceTest.id,
        priceId: scenario.price.id,
        type: SubscriptionItemType.Usage,
        ledgerAccountId: scenario.ledgerAccount.id,
        ledgerAccountCredit: scenario.ledgerEntries[0].amount,
        billingRunId: billingRunTest.id,
        livemode: false,
      })

      // 2. Construct the command with livemode: false.
      const command: SettleInvoiceUsageCostsLedgerCommand = {
        organizationId: scenario.organization.id,
        subscriptionId: scenario.subscription.id,
        livemode: false,
        type: LedgerTransactionType.SettleInvoiceUsageCosts,
        payload: {
          invoice: invoiceTest,
          invoiceLineItems: [usageInvoiceLineItemTest],
        },
      }

      // execute:
      const {
        ledgerTransaction,
        ledgerEntries: createdLedgerEntries,
      } = await adminTransaction(async ({ transaction }) => {
        return await processSettleInvoiceUsageCostsLedgerCommand(
          command,
          transaction
        )
      })

      // expects:
      expect(ledgerTransaction.livemode).toBe(false)
      expect(
        createdLedgerEntries.every((le) => le.livemode === false)
      ).toBe(true)

      const finalBalance = await adminTransaction(
        async ({ transaction }) => {
          return await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: scenario.ledgerAccount.id },
            'available',
            transaction
          )
        }
      )
      expect(finalBalance).toBe(0)
    })
  })

  describe('Settlement with prior credit balance', () => {
    it('should settle usage costs correctly when a non-expiring credit exists', async () => {
      // setup:
      const priorCreditAmount = 5000
      const priorCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: priorCreditAmount,
        usageMeterId: usageMeter.id,
        expiresAt: null, // non-expiring
      })
      const grantTx = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.AdminCreditAdjusted,
      })
      await setupLedgerEntries({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: grantTx.id,
        ledgerAccountId: ledgerAccount.id,
        usageMeterId: ledgerAccount.usageMeterId!,
        entries: [
          {
            entryType: LedgerEntryType.CreditGrantRecognized,
            sourceUsageCreditId: priorCredit.id,
            amount: priorCreditAmount,
          },
        ],
      })

      const initialBalance = await adminTransaction(
        async ({ transaction }) => {
          return await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        }
      )
      expect(initialBalance).toBe(
        priorCreditAmount - usageCostLedgerEntry.amount
      )

      const command: SettleInvoiceUsageCostsLedgerCommand = {
        organizationId: organization.id,
        subscriptionId: subscription.id,
        livemode: subscription.livemode,
        type: LedgerTransactionType.SettleInvoiceUsageCosts,
        payload: {
          invoice,
          invoiceLineItems: [usageInvoiceLineItem],
        },
      }

      // execute:
      await adminTransaction(async ({ transaction }) => {
        await processSettleInvoiceUsageCostsLedgerCommand(
          command,
          transaction
        )
      })

      // expects:
      const finalBalance = await adminTransaction(
        async ({ transaction }) => {
          return await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        }
      )
      // The settlement zeroes out the usage cost, leaving the prior credit intact.
      expect(finalBalance).toBe(priorCreditAmount)
    })

    it('should settle usage costs correctly when an expiring credit exists', async () => {
      // setup:
      const priorCreditAmount = 3000
      const priorCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: priorCreditAmount,
        usageMeterId: usageMeter.id,
        expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30, // expires in 30 days
      })
      const grantTx = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.AdminCreditAdjusted,
      })
      await setupLedgerEntries({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: grantTx.id,
        ledgerAccountId: ledgerAccount.id,
        usageMeterId: ledgerAccount.usageMeterId!,
        entries: [
          {
            entryType: LedgerEntryType.CreditGrantRecognized,
            sourceUsageCreditId: priorCredit.id,
            amount: priorCreditAmount,
          },
        ],
      })

      const command: SettleInvoiceUsageCostsLedgerCommand = {
        organizationId: organization.id,
        subscriptionId: subscription.id,
        livemode: subscription.livemode,
        type: LedgerTransactionType.SettleInvoiceUsageCosts,
        payload: {
          invoice,
          invoiceLineItems: [usageInvoiceLineItem],
        },
      }

      // execute:
      await adminTransaction(async ({ transaction }) => {
        await processSettleInvoiceUsageCostsLedgerCommand(
          command,
          transaction
        )
      })

      // expects:
      const finalBalance = await adminTransaction(
        async ({ transaction }) => {
          return await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        }
      )
      expect(finalBalance).toBe(priorCreditAmount)
    })

    it('should settle usage costs correctly with both expiring and non-expiring credits', async () => {
      // setup:
      const nonExpiringAmount = 2000
      const expiringAmount = 2500
      const totalPriorCredit = nonExpiringAmount + expiringAmount

      const nonExpiringCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: nonExpiringAmount,
        usageMeterId: usageMeter.id,
        expiresAt: null,
      })
      const expiringCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: expiringAmount,
        usageMeterId: usageMeter.id,
        expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30,
      })

      const grantTx = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.AdminCreditAdjusted,
      })
      await setupLedgerEntries({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: grantTx.id,
        ledgerAccountId: ledgerAccount.id,
        usageMeterId: ledgerAccount.usageMeterId!,
        entries: [
          {
            entryType: LedgerEntryType.CreditGrantRecognized,
            sourceUsageCreditId: nonExpiringCredit.id,
            amount: nonExpiringAmount,
          },
          {
            entryType: LedgerEntryType.CreditGrantRecognized,
            sourceUsageCreditId: expiringCredit.id,
            amount: expiringAmount,
          },
        ],
      })

      const command: SettleInvoiceUsageCostsLedgerCommand = {
        organizationId: organization.id,
        subscriptionId: subscription.id,
        livemode: subscription.livemode,
        type: LedgerTransactionType.SettleInvoiceUsageCosts,
        payload: {
          invoice,
          invoiceLineItems: [usageInvoiceLineItem],
        },
      }

      // execute:
      await adminTransaction(async ({ transaction }) => {
        await processSettleInvoiceUsageCostsLedgerCommand(
          command,
          transaction
        )
      })

      // expects:
      const finalBalance = await adminTransaction(
        async ({ transaction }) => {
          return await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        }
      )
      expect(finalBalance).toBe(totalPriorCredit)
    })
  })
})
