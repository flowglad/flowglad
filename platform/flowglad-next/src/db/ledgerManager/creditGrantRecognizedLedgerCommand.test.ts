import { describe, it, expect } from 'vitest'
import { processCreditGrantRecognizedLedgerCommand } from '@/db/ledgerManager/creditGrantRecognizedLedgerCommand'
import { CreditGrantRecognizedLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import {
  LedgerEntryStatus,
  LedgerEntryDirection,
  LedgerEntryType,
  LedgerTransactionType,
  UsageCreditType,
} from '@/types'
import {
  setupUsageLedgerScenario,
  setupUsageCredit,
  setupLedgerAccount,
  setupBillingPeriod,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { selectLedgerTransactions } from '@/db/tableMethods/ledgerTransactionMethods'
import { selectLedgerEntries } from '@/db/tableMethods/ledgerEntryMethods'
import { aggregateBalanceForLedgerAccountFromEntries } from '@/db/tableMethods/ledgerEntryMethods'
import { Organization } from '@/db/schema/organizations'
import { Subscription } from '@/db/schema/subscriptions'
import { UsageMeter } from '@/db/schema/usageMeters'
import { LedgerAccount } from '@/db/schema/ledgerAccounts'
import { UsageCredit } from '@/db/schema/usageCredits'
import { BillingPeriod } from '@/db/schema/billingPeriods'

describe('processCreditGrantRecognizedLedgerCommand', () => {
  it('should successfully process a credit grant with all fields provided', async () => {
    // setup:
    // - use setupUsageLedgerScenario to create organization, subscription, usageMeter, and ledgerAccount
    // - create a billingPeriod for the subscription
    // - create a usageCredit with billingPeriodId set, issuedAmount, and matching usageMeterId
    // - construct command with transactionDescription, transactionMetadata, and all required fields
    // - record current timestamp before execution
    // - query initial balance using aggregateBalanceForLedgerAccountFromEntries
    // expects:
    // - function returns LedgerCommandResult with ledgerTransaction and ledgerEntries array
    // - ledgerTransaction has valid id
    // - ledgerTransaction.organizationId equals command.organizationId
    // - ledgerTransaction.livemode equals command.livemode
    // - ledgerTransaction.type equals command.type (LedgerTransactionType.CreditGrantRecognized)
    // - ledgerTransaction.description equals command.transactionDescription
    // - ledgerTransaction.metadata equals command.transactionMetadata
    // - ledgerTransaction.initiatingSourceType equals command.type
    // - ledgerTransaction.initiatingSourceId equals usageCredit.id
    // - ledgerTransaction.subscriptionId equals command.subscriptionId
    // - ledgerEntries array has length 1
    // - ledgerEntry has valid id
    // - ledgerEntry.ledgerTransactionId equals ledgerTransaction.id
    // - ledgerEntry.ledgerAccountId equals ledgerAccount.id
    // - ledgerEntry.subscriptionId equals command.subscriptionId
    // - ledgerEntry.organizationId equals command.organizationId
    // - ledgerEntry.livemode equals command.livemode
    // - ledgerEntry.status equals LedgerEntryStatus.Posted
    // - ledgerEntry.discardedAt is null
    // - ledgerEntry.direction equals LedgerEntryDirection.Credit
    // - ledgerEntry.entryType equals LedgerEntryType.CreditGrantRecognized
    // - ledgerEntry.amount equals usageCredit.issuedAmount
    // - ledgerEntry.description equals "Promotional credit {usageCredit.id} granted."
    // - ledgerEntry.sourceUsageCreditId equals usageCredit.id
    // - ledgerEntry.billingPeriodId equals usageCredit.billingPeriodId
    // - ledgerEntry.usageMeterId equals usageCredit.usageMeterId
    // - ledgerEntry.claimedByBillingRunId is null
    // - ledgerEntry.metadata equals { ledgerCommandType: command.type }
    // - ledgerEntry.entryTimestamp is a valid number (timestamp)
    // - ledgerEntry.entryTimestamp is approximately equal to Date.now() at execution time (within reasonable tolerance)
    // - ledgerEntry.sourceUsageEventId is null
    // - ledgerEntry.sourceCreditApplicationId is null
    // - all other columns from ledgerEntryNulledSourceIdColumns are null
    // - query database using selectLedgerTransactions to verify ledger transaction exists and matches returned value
    // - query database using selectLedgerEntries to verify ledger entry exists and matches returned value
    // - query final balance using aggregateBalanceForLedgerAccountFromEntries
    // - final balance equals initial balance plus usageCredit.issuedAmount
  })

  it('should successfully process a credit grant without transactionDescription', async () => {
    // setup:
    // - use setupUsageLedgerScenario to create organization, subscription, usageMeter, and ledgerAccount
    // - create a usageCredit with issuedAmount and matching usageMeterId
    // - construct command without transactionDescription field
    // - query initial balance using aggregateBalanceForLedgerAccountFromEntries
    // expects:
    // - function returns LedgerCommandResult with ledgerTransaction and ledgerEntries array
    // - ledgerTransaction.description is null
    // - ledgerTransaction has valid id, matches organizationId, livemode, type from command
    // - ledgerTransaction.initiatingSourceType equals command.type
    // - ledgerTransaction.initiatingSourceId equals usageCredit.id
    // - ledgerTransaction.subscriptionId equals command.subscriptionId
    // - ledgerEntries array has length 1
    // - ledgerEntry has valid id, ledgerTransactionId matches ledgerTransaction.id
    // - ledgerEntry.ledgerAccountId matches ledgerAccount.id
    // - ledgerEntry matches all expected fields: subscriptionId, organizationId, livemode, status Posted, direction Credit, entryType CreditGrantRecognized
    // - ledgerEntry.amount equals usageCredit.issuedAmount
    // - ledgerEntry.description equals "Promotional credit {usageCredit.id} granted."
    // - ledgerEntry.sourceUsageCreditId equals usageCredit.id
    // - query final balance using aggregateBalanceForLedgerAccountFromEntries
    // - final balance equals initial balance plus usageCredit.issuedAmount
  })

  it('should successfully process a credit grant without transactionMetadata', async () => {
    // setup:
    // - use setupUsageLedgerScenario to create organization, subscription, usageMeter, and ledgerAccount
    // - create a usageCredit with issuedAmount and matching usageMeterId
    // - construct command without transactionMetadata field
    // - query initial balance using aggregateBalanceForLedgerAccountFromEntries
    // expects:
    // - function returns LedgerCommandResult with ledgerTransaction and ledgerEntries array
    // - ledgerTransaction.metadata is null
    // - ledgerTransaction has valid id, matches organizationId, livemode, type from command
    // - ledgerTransaction.initiatingSourceType equals command.type
    // - ledgerTransaction.initiatingSourceId equals usageCredit.id
    // - ledgerTransaction.subscriptionId equals command.subscriptionId
    // - ledgerEntries array has length 1
    // - ledgerEntry has valid id, ledgerTransactionId matches ledgerTransaction.id
    // - ledgerEntry.ledgerAccountId matches ledgerAccount.id
    // - ledgerEntry matches all expected fields: subscriptionId, organizationId, livemode, status Posted, direction Credit, entryType CreditGrantRecognized
    // - ledgerEntry.amount equals usageCredit.issuedAmount
    // - ledgerEntry.description equals "Promotional credit {usageCredit.id} granted."
    // - ledgerEntry.sourceUsageCreditId equals usageCredit.id
    // - ledgerEntry.metadata equals { ledgerCommandType: command.type }
    // - query final balance using aggregateBalanceForLedgerAccountFromEntries
    // - final balance equals initial balance plus usageCredit.issuedAmount
  })

  it('should successfully process a credit grant without billingPeriodId', async () => {
    // setup:
    // - use setupUsageLedgerScenario to create organization, subscription, usageMeter, and ledgerAccount
    // - create a usageCredit with issuedAmount and matching usageMeterId, but billingPeriodId set to null
    // - construct command with all required fields
    // - query initial balance using aggregateBalanceForLedgerAccountFromEntries
    // expects:
    // - function returns LedgerCommandResult with ledgerTransaction and ledgerEntries array
    // - ledgerEntry.billingPeriodId is null
    // - ledgerTransaction has valid id, matches organizationId, livemode, type from command
    // - ledgerTransaction.initiatingSourceType equals command.type
    // - ledgerTransaction.initiatingSourceId equals usageCredit.id
    // - ledgerTransaction.subscriptionId equals command.subscriptionId
    // - ledgerEntries array has length 1
    // - ledgerEntry has valid id, ledgerTransactionId matches ledgerTransaction.id
    // - ledgerEntry.ledgerAccountId matches ledgerAccount.id
    // - ledgerEntry matches all expected fields: subscriptionId, organizationId, livemode, status Posted, direction Credit, entryType CreditGrantRecognized
    // - ledgerEntry.amount equals usageCredit.issuedAmount
    // - ledgerEntry.description equals "Promotional credit {usageCredit.id} granted."
    // - ledgerEntry.sourceUsageCreditId equals usageCredit.id
    // - ledgerEntry.usageMeterId equals usageCredit.usageMeterId
    // - query final balance using aggregateBalanceForLedgerAccountFromEntries
    // - final balance equals initial balance plus usageCredit.issuedAmount
  })

  it('should throw an error when ledger transaction insertion fails', async () => {
    // setup:
    // - use setupUsageLedgerScenario to create organization, subscription, usageMeter, and ledgerAccount
    // - create a usageCredit with issuedAmount and matching usageMeterId
    // - construct command with invalid subscriptionId that doesn't exist or violates foreign key constraint
    // expects:
    // - function throws Error with message containing "Failed to insert ledger transaction for CreditGrantRecognized command or retrieve its ID"
    // - query database using selectLedgerTransactions to verify no ledger transaction was created for this command
    // - query database using selectLedgerEntries to verify no ledger entries were created
  })

  it('should throw an error when usage credit has no usageMeterId', async () => {
    // setup:
    // - use setupUsageLedgerScenario to create organization, subscription, usageMeter, and ledgerAccount
    // - create a usageCredit with issuedAmount but usageMeterId set to null
    // - construct command with all required fields
    // expects:
    // - function throws Error with message containing "Cannot process Credit Grant Recognized command: usage credit must have a usageMeterId"
    // - query database using selectLedgerTransactions to verify no ledger transaction was created
    // - query database using selectLedgerEntries to verify no ledger entries were created
  })

  it('should successfully process a credit grant with livemode true', async () => {
    // setup:
    // - use setupUsageLedgerScenario with livemode true to create organization, subscription, usageMeter, and ledgerAccount
    // - create a usageCredit with livemode true, issuedAmount and matching usageMeterId
    // - construct command with livemode true
    // - query initial balance using aggregateBalanceForLedgerAccountFromEntries
    // expects:
    // - function returns LedgerCommandResult with ledgerTransaction and ledgerEntries array
    // - ledgerTransaction.livemode is true
    // - ledgerEntry.livemode is true
    // - ledgerTransaction has valid id, matches organizationId, type from command
    // - ledgerTransaction.initiatingSourceType equals command.type
    // - ledgerTransaction.initiatingSourceId equals usageCredit.id
    // - ledgerEntry has valid id, ledgerTransactionId matches ledgerTransaction.id
    // - ledgerEntry.ledgerAccountId matches ledgerAccount.id
    // - ledgerEntry.amount equals usageCredit.issuedAmount
    // - query database using selectLedgerTransactions to verify ledger transaction exists with livemode true
    // - query database using selectLedgerEntries to verify ledger entry exists with livemode true
    // - query final balance using aggregateBalanceForLedgerAccountFromEntries
    // - final balance equals initial balance plus usageCredit.issuedAmount
  })

  it('should successfully process a credit grant with livemode false', async () => {
    // setup:
    // - use setupUsageLedgerScenario with livemode false to create organization, subscription, usageMeter, and ledgerAccount
    // - create a usageCredit with livemode false, issuedAmount and matching usageMeterId
    // - construct command with livemode false
    // - query initial balance using aggregateBalanceForLedgerAccountFromEntries
    // expects:
    // - function returns LedgerCommandResult with ledgerTransaction and ledgerEntries array
    // - ledgerTransaction.livemode is false
    // - ledgerEntry.livemode is false
    // - ledgerTransaction has valid id, matches organizationId, type from command
    // - ledgerTransaction.initiatingSourceType equals command.type
    // - ledgerTransaction.initiatingSourceId equals usageCredit.id
    // - ledgerEntry has valid id, ledgerTransactionId matches ledgerTransaction.id
    // - ledgerEntry.ledgerAccountId matches ledgerAccount.id
    // - ledgerEntry.amount equals usageCredit.issuedAmount
    // - query database using selectLedgerTransactions to verify ledger transaction exists with livemode false
    // - query database using selectLedgerEntries to verify ledger entry exists with livemode false
    // - query final balance using aggregateBalanceForLedgerAccountFromEntries
    // - final balance equals initial balance plus usageCredit.issuedAmount
  })

  it('should successfully process a credit grant with zero amount', async () => {
    // setup:
    // - use setupUsageLedgerScenario to create organization, subscription, usageMeter, and ledgerAccount
    // - create a usageCredit with issuedAmount 0 and matching usageMeterId
    // - construct command with all required fields
    // - query initial balance using aggregateBalanceForLedgerAccountFromEntries
    // expects:
    // - function returns LedgerCommandResult with ledgerTransaction and ledgerEntries array
    // - ledgerEntry.amount equals 0
    // - ledgerTransaction has valid id, matches organizationId, livemode, type from command
    // - ledgerTransaction.initiatingSourceType equals command.type
    // - ledgerTransaction.initiatingSourceId equals usageCredit.id
    // - ledgerEntry has valid id, ledgerTransactionId matches ledgerTransaction.id
    // - ledgerEntry.ledgerAccountId matches ledgerAccount.id
    // - query final balance using aggregateBalanceForLedgerAccountFromEntries
    // - final balance equals initial balance plus 0
  })

  it('should successfully process a credit grant with small amount', async () => {
    // setup:
    // - use setupUsageLedgerScenario to create organization, subscription, usageMeter, and ledgerAccount
    // - create a usageCredit with issuedAmount 1 and matching usageMeterId
    // - construct command with all required fields
    // - query initial balance using aggregateBalanceForLedgerAccountFromEntries
    // expects:
    // - function returns LedgerCommandResult with ledgerTransaction and ledgerEntries array
    // - ledgerEntry.amount equals 1
    // - ledgerTransaction has valid id, matches organizationId, livemode, type from command
    // - ledgerTransaction.initiatingSourceType equals command.type
    // - ledgerTransaction.initiatingSourceId equals usageCredit.id
    // - ledgerEntry has valid id, ledgerTransactionId matches ledgerTransaction.id
    // - ledgerEntry.ledgerAccountId matches ledgerAccount.id
    // - query final balance using aggregateBalanceForLedgerAccountFromEntries
    // - final balance equals initial balance plus 1
  })

  it('should successfully process a credit grant with large amount', async () => {
    // setup:
    // - use setupUsageLedgerScenario to create organization, subscription, usageMeter, and ledgerAccount
    // - create a usageCredit with issuedAmount 999999999 and matching usageMeterId
    // - construct command with all required fields
    // - query initial balance using aggregateBalanceForLedgerAccountFromEntries
    // expects:
    // - function returns LedgerCommandResult with ledgerTransaction and ledgerEntries array
    // - ledgerEntry.amount equals 999999999
    // - ledgerTransaction has valid id, matches organizationId, livemode, type from command
    // - ledgerTransaction.initiatingSourceType equals command.type
    // - ledgerTransaction.initiatingSourceId equals usageCredit.id
    // - ledgerEntry has valid id, ledgerTransactionId matches ledgerTransaction.id
    // - ledgerEntry.ledgerAccountId matches ledgerAccount.id
    // - query final balance using aggregateBalanceForLedgerAccountFromEntries
    // - final balance equals initial balance plus 999999999
  })

  it('should successfully process a credit grant with different usage meter', async () => {
    // setup:
    // - use setupUsageLedgerScenario to create organization, subscription, and first usageMeter
    // - create a second usageMeter for the same organization and pricingModel
    // - create a ledgerAccount for the second usageMeter
    // - create a usageCredit with issuedAmount and usageMeterId matching the second usageMeter
    // - construct command with all required fields
    // - query initial balance for second ledgerAccount using aggregateBalanceForLedgerAccountFromEntries
    // expects:
    // - function returns LedgerCommandResult with ledgerTransaction and ledgerEntries array
    // - ledgerEntry.usageMeterId equals the second usageMeter.id
    // - ledgerEntry.ledgerAccountId matches the ledgerAccount for the second usageMeter
    // - ledgerTransaction has valid id, matches organizationId, livemode, type from command
    // - ledgerTransaction.initiatingSourceType equals command.type
    // - ledgerTransaction.initiatingSourceId equals usageCredit.id
    // - ledgerEntry has valid id, ledgerTransactionId matches ledgerTransaction.id
    // - ledgerEntry.amount equals usageCredit.issuedAmount
    // - query final balance for second ledgerAccount using aggregateBalanceForLedgerAccountFromEntries
    // - final balance equals initial balance plus usageCredit.issuedAmount
  })

  it('should select first ledger account when multiple exist', async () => {
    // setup:
    // - use setupUsageLedgerScenario to create organization, subscription, and usageMeter
    // - create first ledgerAccount for subscription and usageMeter
    // - create second ledgerAccount for same subscription and usageMeter (same organizationId and livemode)
    // - create a usageCredit with issuedAmount and matching usageMeterId
    // - construct command with all required fields
    // - query initial balance for first ledgerAccount using aggregateBalanceForLedgerAccountFromEntries
    // expects:
    // - function returns LedgerCommandResult with ledgerTransaction and ledgerEntries array
    // - ledgerEntries array has length 1 (not one per account)
    // - ledgerEntry.ledgerAccountId matches one of the existing ledger accounts (first or second)
    // - ledgerTransaction has valid id, matches organizationId, livemode, type from command
    // - ledgerTransaction.initiatingSourceType equals command.type
    // - ledgerTransaction.initiatingSourceId equals usageCredit.id
    // - ledgerEntry has valid id, ledgerTransactionId matches ledgerTransaction.id
    // - ledgerEntry.amount equals usageCredit.issuedAmount
    // - query final balance for the selected ledgerAccount using aggregateBalanceForLedgerAccountFromEntries
    // - final balance equals initial balance plus usageCredit.issuedAmount
  })

  it('should correctly process credit grant with existing ledger entries', async () => {
    // setup:
    // - use setupUsageLedgerScenario with quickEntries to create organization, subscription, usageMeter, ledgerAccount, and existing ledger entries
    // - query initial balance using aggregateBalanceForLedgerAccountFromEntries
    // - create a usageCredit with issuedAmount and matching usageMeterId
    // - construct command with all required fields
    // expects:
    // - function returns LedgerCommandResult with ledgerTransaction and ledgerEntries array
    // - ledgerEntries array has length 1
    // - ledgerEntry has valid id, ledgerTransactionId matches ledgerTransaction.id
    // - ledgerEntry.ledgerAccountId matches ledgerAccount.id
    // - ledgerEntry.amount equals usageCredit.issuedAmount
    // - ledgerTransaction has valid id, matches organizationId, livemode, type from command
    // - ledgerTransaction.initiatingSourceType equals command.type
    // - ledgerTransaction.initiatingSourceId equals usageCredit.id
    // - query final balance using aggregateBalanceForLedgerAccountFromEntries
    // - final balance accounts for both existing entries and new credit grant entry (equals initial balance plus usageCredit.issuedAmount)
  })
})
