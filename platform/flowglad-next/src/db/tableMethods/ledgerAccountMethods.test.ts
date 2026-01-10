import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  setupCustomer,
  setupLedgerAccount,
  setupOrg,
  setupPaymentMethod,
  setupSubscription,
  setupUsageMeter,
} from '@/../seedDatabase' // Corrected path
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { LedgerAccount } from '@/db/schema/ledgerAccounts'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import type { Subscription } from '@/db/schema/subscriptions'
import type { UsageMeter } from '@/db/schema/usageMeters'
import {
  AdminTransactionParams,
  type DbTransaction,
} from '@/db/types'
import { NormalBalanceType } from '@/types'
import { core } from '@/utils/core'
import {
  bulkInsertLedgerAccountsBySubscriptionIdAndUsageMeterId,
  findOrCreateLedgerAccountsForSubscriptionAndUsageMeters,
  insertLedgerAccount,
  selectLedgerAccounts,
} from './ledgerAccountMethods'

describe('findOrCreateLedgerAccountsForSubscriptionAndUsageMeters', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let usageMeter1: UsageMeter.Record
  let usageMeter2: UsageMeter.Record
  let usageMeter3: UsageMeter.Record
  let ledgerAccountForUsageMeter1: LedgerAccount.Record // Pre-existing for subscription & usageMeter1

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product
    price = orgData.price

    customer = await setupCustomer({
      organizationId: organization.id,
      email: `customer+${core.nanoid()}@test.com`,
      livemode: true,
    })

    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      livemode: true,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      livemode: true,
    })

    usageMeter1 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter 1',
      pricingModelId: pricingModel.id,
      livemode: true,
    })

    usageMeter2 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter 2',
      pricingModelId: pricingModel.id,
      livemode: true,
    })

    usageMeter3 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter 3',
      pricingModelId: pricingModel.id,
      livemode: true,
    })

    ledgerAccountForUsageMeter1 = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter1.id,
      livemode: subscription.livemode,
    })
  })

  it('should return existing ledger accounts and not attempt to create new ones if all specified ledger accounts already exist', async () => {
    await adminTransaction(async ({ transaction }) => {
      // setup:
      const ledgerAccountForUsageMeter2 = await setupLedgerAccount({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter2.id,
        livemode: subscription.livemode,
      })

      const initialLedgerAccounts = await selectLedgerAccounts(
        {
          subscriptionId: subscription.id,
          usageMeterId: [usageMeter1.id, usageMeter2.id],
        },
        transaction as DbTransaction
      )
      expect(initialLedgerAccounts.length).toBe(2)

      // action:
      const result =
        await findOrCreateLedgerAccountsForSubscriptionAndUsageMeters(
          {
            subscriptionId: subscription.id,
            usageMeterIds: [usageMeter1.id, usageMeter2.id],
          },
          transaction as DbTransaction
        )

      // expectations:
      expect(result).toHaveLength(2)
      expect(
        result.find((la) => la.usageMeterId === usageMeter1.id)?.id
      ).toBe(ledgerAccountForUsageMeter1.id)
      expect(
        result.find((la) => la.usageMeterId === usageMeter2.id)?.id
      ).toBe(ledgerAccountForUsageMeter2.id)

      const finalLedgerAccounts = await selectLedgerAccounts(
        { subscriptionId: subscription.id },
        transaction as DbTransaction
      )
      const relevantFinalLedgerAccounts = finalLedgerAccounts.filter(
        (la) =>
          la.subscriptionId === subscription.id &&
          [usageMeter1.id, usageMeter2.id].includes(la.usageMeterId!)
      )
      expect(relevantFinalLedgerAccounts).toHaveLength(2)
    })
  })

  it('should create new ledger accounts for all usage meters if none exist', async () => {
    await adminTransaction(async ({ transaction }) => {
      // setup:
      const usageMeterIdsToCreateFor = [
        usageMeter2.id,
        usageMeter3.id,
      ]
      const initialLedgerAccounts = await selectLedgerAccounts(
        {
          subscriptionId: subscription.id,
          usageMeterId: usageMeterIdsToCreateFor,
        },
        transaction as DbTransaction
      )
      expect(initialLedgerAccounts.length).toBe(0)

      // action:
      const result =
        await findOrCreateLedgerAccountsForSubscriptionAndUsageMeters(
          {
            subscriptionId: subscription.id,
            usageMeterIds: usageMeterIdsToCreateFor,
          },
          transaction as DbTransaction
        )

      // expectations:
      expect(result).toHaveLength(2)

      const createdLedgerAccounts = await selectLedgerAccounts(
        {
          subscriptionId: subscription.id,
          usageMeterId: usageMeterIdsToCreateFor,
        },
        transaction as DbTransaction
      )
      expect(createdLedgerAccounts).toHaveLength(2)
      for (const usageMeterId of usageMeterIdsToCreateFor) {
        const newLa = createdLedgerAccounts.find(
          (la) => la.usageMeterId === usageMeterId
        )
        expect(newLa).toMatchObject({
          livemode: subscription.livemode,
        })
        expect(newLa?.organizationId).toBe(
          subscription.organizationId
        )
        expect(newLa?.livemode).toBe(subscription.livemode)
        expect(newLa?.subscriptionId).toBe(subscription.id)
        // Verify pricingModelId is correctly derived from usage meter
        const usageMeter = [
          usageMeter1,
          usageMeter2,
          usageMeter3,
        ].find((um) => um.id === usageMeterId)
        if (usageMeter) {
          expect(newLa?.pricingModelId).toBe(
            usageMeter.pricingModelId
          )
        }
      }
    })
  })

  it('should create missing ledger accounts and return the initially existing accounts and the newly created ones', async () => {
    await adminTransaction(async ({ transaction }) => {
      // setup:
      const usageMeterIdsToProcess = [usageMeter1.id, usageMeter2.id]

      const initiallyExisting = await selectLedgerAccounts(
        {
          subscriptionId: subscription.id,
          usageMeterId: [usageMeter1.id],
        },
        transaction as DbTransaction
      )
      expect(initiallyExisting.length).toBe(1)
      expect(initiallyExisting[0].id).toBe(
        ledgerAccountForUsageMeter1.id
      )

      const nonExistingCheck = await selectLedgerAccounts(
        {
          subscriptionId: subscription.id,
          usageMeterId: [usageMeter2.id],
        },
        transaction as DbTransaction
      )
      expect(nonExistingCheck.length).toBe(0)

      // action:
      const result =
        await findOrCreateLedgerAccountsForSubscriptionAndUsageMeters(
          {
            subscriptionId: subscription.id,
            usageMeterIds: usageMeterIdsToProcess,
          },
          transaction as DbTransaction
        )

      // expectations:
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe(ledgerAccountForUsageMeter1.id)
      expect(result[0].usageMeterId).toBe(usageMeter1.id)
      // Verify pricingModelId is correctly derived from usage meter
      expect(result[0].pricingModelId).toBe(
        usageMeter1.pricingModelId
      )
      expect(result[1].usageMeterId).toBe(usageMeter2.id)
      // Verify pricingModelId is correctly derived from usage meter
      expect(result[1].pricingModelId).toBe(
        usageMeter2.pricingModelId
      )

      const newLedgerAccountForUM2 = await selectLedgerAccounts(
        {
          subscriptionId: subscription.id,
          usageMeterId: [usageMeter2.id],
        },
        transaction as DbTransaction
      )
      expect(newLedgerAccountForUM2).toHaveLength(1)
      expect(newLedgerAccountForUM2[0].organizationId).toBe(
        subscription.organizationId
      )
      expect(newLedgerAccountForUM2[0].livemode).toBe(
        subscription.livemode
      )
      expect(newLedgerAccountForUM2[0].subscriptionId).toBe(
        subscription.id
      )

      const finalLedgerAccountForUM1 = await selectLedgerAccounts(
        {
          subscriptionId: subscription.id,
          usageMeterId: [usageMeter1.id],
        },
        transaction as DbTransaction
      )
      expect(finalLedgerAccountForUM1).toHaveLength(1)
      expect(finalLedgerAccountForUM1[0].id).toBe(
        ledgerAccountForUsageMeter1.id
      )
    })
  })

  it('should return an empty array and not attempt to create accounts if usageMeterIds is empty', async () => {
    await adminTransaction(async ({ transaction }) => {
      // setup:
      const initialTotalLedgerAccountsForSub = (
        await selectLedgerAccounts(
          { subscriptionId: subscription.id },
          transaction as DbTransaction
        )
      ).length

      // action:
      const result =
        await findOrCreateLedgerAccountsForSubscriptionAndUsageMeters(
          {
            subscriptionId: subscription.id,
            usageMeterIds: [],
          },
          transaction as DbTransaction
        )

      // expectations:
      expect(result).toEqual([])

      const finalTotalLedgerAccountsForSub = (
        await selectLedgerAccounts(
          { subscriptionId: subscription.id },
          transaction as DbTransaction
        )
      ).length
      expect(finalTotalLedgerAccountsForSub).toBe(
        initialTotalLedgerAccountsForSub
      )
    })
  })
})

describe('Ledger Account Methods with pricingModelId', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let usageMeter1: UsageMeter.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product
    price = orgData.price

    customer = await setupCustomer({
      organizationId: organization.id,
      email: `customer+${core.nanoid()}@test.com`,
      livemode: true,
    })

    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      livemode: true,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      livemode: true,
    })

    usageMeter1 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter 1',
      pricingModelId: pricingModel.id,
      livemode: true,
    })
  })

  describe('insertLedgerAccount', () => {
    it('should successfully insert ledger account and derive pricingModelId from usage meter', async () => {
      await adminTransaction(async ({ transaction }) => {
        const ledgerAccount = await insertLedgerAccount(
          {
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter1.id,
            livemode: true,
            normalBalance: NormalBalanceType.CREDIT,
            version: 0,
          },
          transaction
        )

        // Verify pricingModelId is correctly derived from usage meter
        expect(ledgerAccount.pricingModelId).toBe(
          usageMeter1.pricingModelId
        )
        expect(ledgerAccount.pricingModelId).toBe(pricingModel.id)
      })
    })

    it('should use provided pricingModelId without derivation', async () => {
      await adminTransaction(async ({ transaction }) => {
        const ledgerAccount = await insertLedgerAccount(
          {
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter1.id,
            livemode: true,
            normalBalance: NormalBalanceType.CREDIT,
            version: 0,
            pricingModelId: pricingModel.id, // Pre-provided
          },
          transaction
        )

        // Verify the provided pricingModelId is used
        expect(ledgerAccount.pricingModelId).toBe(pricingModel.id)
      })
    })

    it('should throw an error when usageMeterId does not exist', async () => {
      await adminTransaction(async ({ transaction }) => {
        const nonExistentUsageMeterId = `um_${core.nanoid()}`

        await expect(
          insertLedgerAccount(
            {
              organizationId: organization.id,
              subscriptionId: subscription.id,
              usageMeterId: nonExistentUsageMeterId,
              livemode: true,
              normalBalance: NormalBalanceType.CREDIT,
              version: 0,
            },
            transaction
          )
        ).rejects.toThrow()
      })
    })
  })

  describe('bulkInsertLedgerAccountsBySubscriptionIdAndUsageMeterId', () => {
    let usageMeter2: UsageMeter.Record

    beforeEach(async () => {
      usageMeter2 = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Test Usage Meter 2',
        pricingModelId: pricingModel.id,
        livemode: true,
      })
    })

    it('should bulk insert ledger accounts and derive pricingModelId for each', async () => {
      await adminTransaction(async ({ transaction }) => {
        const ledgerAccounts =
          await bulkInsertLedgerAccountsBySubscriptionIdAndUsageMeterId(
            [
              {
                organizationId: organization.id,
                subscriptionId: subscription.id,
                usageMeterId: usageMeter1.id,
                livemode: true,
                normalBalance: NormalBalanceType.CREDIT,
                version: 0,
              },
              {
                organizationId: organization.id,
                subscriptionId: subscription.id,
                usageMeterId: usageMeter2.id,
                livemode: true,
                normalBalance: NormalBalanceType.CREDIT,
                version: 0,
              },
            ],
            transaction
          )

        expect(ledgerAccounts).toHaveLength(2)
        expect(ledgerAccounts[0]!.pricingModelId).toBe(
          usageMeter1.pricingModelId
        )
        expect(ledgerAccounts[1]!.pricingModelId).toBe(
          usageMeter2.pricingModelId
        )
      })
    })

    it('should honor pre-provided pricingModelId in bulk insert', async () => {
      await adminTransaction(async ({ transaction }) => {
        const ledgerAccounts =
          await bulkInsertLedgerAccountsBySubscriptionIdAndUsageMeterId(
            [
              {
                organizationId: organization.id,
                subscriptionId: subscription.id,
                usageMeterId: usageMeter1.id,
                livemode: true,
                normalBalance: NormalBalanceType.CREDIT,
                version: 0,
                pricingModelId: pricingModel.id, // Pre-provided
              },
              {
                organizationId: organization.id,
                subscriptionId: subscription.id,
                usageMeterId: usageMeter2.id,
                livemode: true,
                normalBalance: NormalBalanceType.CREDIT,
                version: 0,
                // No pricingModelId - should derive
              },
            ],
            transaction
          )

        expect(ledgerAccounts).toHaveLength(2)
        expect(ledgerAccounts[0]!.pricingModelId).toBe(
          pricingModel.id
        )
        expect(ledgerAccounts[1]!.pricingModelId).toBe(
          usageMeter2.pricingModelId
        )
      })
    })

    it('should throw an error if a usage meter does not exist for derivation', async () => {
      await adminTransaction(async ({ transaction }) => {
        const nonExistentUsageMeterId = `um_${core.nanoid()}`

        await expect(
          bulkInsertLedgerAccountsBySubscriptionIdAndUsageMeterId(
            [
              {
                organizationId: organization.id,
                subscriptionId: subscription.id,
                usageMeterId: nonExistentUsageMeterId,
                livemode: true,
                normalBalance: NormalBalanceType.CREDIT,
                version: 0,
              },
            ],
            transaction
          )
        ).rejects.toThrow()
      })
    })
  })
})
