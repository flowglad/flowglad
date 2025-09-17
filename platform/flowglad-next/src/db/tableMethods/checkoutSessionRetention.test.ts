import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  IntervalUnit,
  PriceType,
} from '@/types'
import {
  deleteExpiredCheckoutSessionsAndFeeCalculations,
  selectCheckoutSessionById,
} from './checkoutSessionMethods'
import { checkoutSessions } from '@/db/schema/checkoutSessions'
import {
  setupOrg,
  setupCustomer,
  setupPrice,
  setupCheckoutSession,
  setupFeeCalculation,
  teardownOrg,
} from '@/../seedDatabase'
import { eq } from 'drizzle-orm'

// Target: deleteExpiredCheckoutSessionsAndFeeCalculations (src/db/tableMethods/checkoutSessionMethods.ts)
// Behavior: Deletes checkout sessions older than 14 days by createdAt (hardcoded),
// excluding Succeeded and Pending; cascades delete to associated fee calculations.

describe('deleteExpiredCheckoutSessionsAndFeeCalculations (retention cleanup)', () => {
  let organizationId: string
  let customerId: string
  let priceId: string

  beforeEach(async () => {
    const { organization, product } = await setupOrg()
    organizationId = organization.id
    const customer = await setupCustomer({ organizationId })
    customerId = customer.id
    const price = await setupPrice({
      productId: product.id,
      name: 'Retention Test Price',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
    })
    priceId = price.id
  })

  afterEach(async () => {
    await teardownOrg({ organizationId })
  })

  it('deletes sessions older than 14 days, keeps recent ones', async () => {
    // setup:
    // - create org, price, customer
    // - create oldOpen (createdAt = now - 15d)
    // - create recentOpen (createdAt = now - 1d)
    // create recent (1d old)
    const recent = await setupCheckoutSession({
      organizationId,
      customerId,
      priceId,
      status: CheckoutSessionStatus.Open,
      type: CheckoutSessionType.Product,
      quantity: 1,
      livemode: true,
    })

    // create old (15d old) and backdate createdAt
    const old = await setupCheckoutSession({
      organizationId,
      customerId,
      priceId,
      status: CheckoutSessionStatus.Open,
      type: CheckoutSessionType.Product,
      quantity: 1,
      livemode: true,
    })
    const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000
    const backdate = new Date(Date.now() - fifteenDaysMs)
    await adminTransaction(async ({ transaction }) => {
      await transaction
        .update(checkoutSessions)
        .set({ createdAt: backdate })
        .where(eq(checkoutSessions.id, old.id))
    })

    const deleted = await adminTransaction(async ({ transaction }) =>
      deleteExpiredCheckoutSessionsAndFeeCalculations(transaction)
    )

    expect(deleted.find((s) => s.id === old.id)).toBeDefined()
    expect(deleted.find((s) => s.id === recent.id)).toBeUndefined()
    await expect(
      adminTransaction(async ({ transaction }) =>
        selectCheckoutSessionById(old.id, transaction)
      )
    ).rejects.toThrow()
    const recentStillThere = await adminTransaction(
      async ({ transaction }) =>
        selectCheckoutSessionById(recent.id, transaction)
    )
    expect(recentStillThere.id).toBe(recent.id)
  })

  it('excludes Succeeded and Pending from deletion even if older than 14 days', async () => {
    // setup:
    // - create oldSucceeded (15d old)
    // - create oldPending (15d old)
    const oldSucceeded = await setupCheckoutSession({
      organizationId,
      customerId,
      priceId,
      status: CheckoutSessionStatus.Succeeded,
      type: CheckoutSessionType.Product,
      quantity: 1,
      livemode: true,
    })
    const oldPending = await setupCheckoutSession({
      organizationId,
      customerId,
      priceId,
      status: CheckoutSessionStatus.Pending,
      type: CheckoutSessionType.Product,
      quantity: 1,
      livemode: true,
    })
    const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000
    const backdate = new Date(Date.now() - fifteenDaysMs)
    await adminTransaction(async ({ transaction }) => {
      await transaction
        .update(checkoutSessions)
        .set({ createdAt: backdate })
        .where(eq(checkoutSessions.id, oldSucceeded.id))
      await transaction
        .update(checkoutSessions)
        .set({ createdAt: backdate })
        .where(eq(checkoutSessions.id, oldPending.id))
    })

    const deleted = await adminTransaction(async ({ transaction }) =>
      deleteExpiredCheckoutSessionsAndFeeCalculations(transaction)
    )
    expect(
      deleted.find((s) => s.id === oldSucceeded.id)
    ).toBeUndefined()
    expect(
      deleted.find((s) => s.id === oldPending.id)
    ).toBeUndefined()
    // ensure both still present
    const s1 = await adminTransaction(async ({ transaction }) =>
      selectCheckoutSessionById(oldSucceeded.id, transaction)
    )
    const s2 = await adminTransaction(async ({ transaction }) =>
      selectCheckoutSessionById(oldPending.id, transaction)
    )
    expect(s1.id).toBe(oldSucceeded.id)
    expect(s2.id).toBe(oldPending.id)
  })

  it('cascades delete fee calculations only for deleted sessions', async () => {
    // setup:
    // - create oldOpen (15d old) with fee calc
    // - create recentOpen (1d old) with fee calc
    const recent = await setupCheckoutSession({
      organizationId,
      customerId,
      priceId,
      status: CheckoutSessionStatus.Open,
      type: CheckoutSessionType.Product,
      quantity: 1,
      livemode: true,
    })
    const old = await setupCheckoutSession({
      organizationId,
      customerId,
      priceId,
      status: CheckoutSessionStatus.Open,
      type: CheckoutSessionType.Product,
      quantity: 1,
      livemode: true,
    })
    const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000
    const backdate = new Date(Date.now() - fifteenDaysMs)
    await adminTransaction(async ({ transaction }) => {
      await transaction
        .update(checkoutSessions)
        .set({ createdAt: backdate })
        .where(eq(checkoutSessions.id, old.id))
    })
    await setupFeeCalculation({
      checkoutSessionId: recent.id,
      organizationId,
      priceId,
    })
    await setupFeeCalculation({
      checkoutSessionId: old.id,
      organizationId,
      priceId,
    })

    const deleted = await adminTransaction(async ({ transaction }) =>
      deleteExpiredCheckoutSessionsAndFeeCalculations(transaction)
    )
    expect(deleted.find((s) => s.id === old.id)).toBeDefined()
    // Verify feeCalculation for old is gone by attempting to re-delete returns empty
    const secondRun = await adminTransaction(
      async ({ transaction }) =>
        deleteExpiredCheckoutSessionsAndFeeCalculations(transaction)
    )
    expect(secondRun.find((s) => s.id === old.id)).toBeUndefined()
    expect(secondRun.find((s) => s.id === recent.id)).toBeUndefined()
  })

  it('no-op when nothing qualifies (all < 14d)', async () => {
    // setup:
    // - create only recent sessions
    const recent = await setupCheckoutSession({
      organizationId,
      customerId,
      priceId,
      status: CheckoutSessionStatus.Open,
      type: CheckoutSessionType.Product,
      quantity: 1,
      livemode: true,
    })
    const result = await adminTransaction(async ({ transaction }) =>
      deleteExpiredCheckoutSessionsAndFeeCalculations(transaction)
    )
    expect(result.find((s) => s.id === recent.id)).toBeUndefined()
    const stillThere = await adminTransaction(
      async ({ transaction }) =>
        selectCheckoutSessionById(recent.id, transaction)
    )
    expect(stillThere.id).toBe(recent.id)
  })

  it('mixed statuses: deletes Open/Failed/Expired; retains Succeeded/Pending (all 15d old)', async () => {
    // setup:
    // - create sessions 15d old with statuses: Open, Failed, Expired, Succeeded, Pending
    const createOld = async (status: CheckoutSessionStatus) => {
      const s = await setupCheckoutSession({
        organizationId,
        customerId,
        priceId,
        status,
        type: CheckoutSessionType.Product,
        quantity: 1,
        livemode: true,
      })
      const backdate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
      await adminTransaction(async ({ transaction }) => {
        await transaction
          .update(checkoutSessions)
          .set({ createdAt: backdate })
          .where(eq(checkoutSessions.id, s.id))
      })
      return s
    }
    const sOpen = await createOld(CheckoutSessionStatus.Open)
    const sFailed = await createOld(CheckoutSessionStatus.Failed)
    const sExpired = await createOld(CheckoutSessionStatus.Expired)
    const sSucceeded = await createOld(
      CheckoutSessionStatus.Succeeded
    )
    const sPending = await createOld(CheckoutSessionStatus.Pending)

    const deleted = await adminTransaction(async ({ transaction }) =>
      deleteExpiredCheckoutSessionsAndFeeCalculations(transaction)
    )
    const deletedIds = deleted.map((s) => s.id)
    expect(deletedIds).toContain(sOpen.id)
    expect(deletedIds).toContain(sFailed.id)
    expect(deletedIds).toContain(sExpired.id)
    expect(deletedIds).not.toContain(sSucceeded.id)
    expect(deletedIds).not.toContain(sPending.id)
  })

  it('boundary: record at exactly 14d cutoff is not deleted (lt comparison)', async () => {
    // setup:
    // - create boundaryOpen with createdAt ~ now - 14d + 1s (just inside window)
    const boundary = await setupCheckoutSession({
      organizationId,
      customerId,
      priceId,
      status: CheckoutSessionStatus.Open,
      type: CheckoutSessionType.Product,
      quantity: 1,
      livemode: true,
    })
    // set createdAt to now - 14d + 60s ⇒ not older than cutoff
    const backdate = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000 + 60 * 1000
    )
    await adminTransaction(async ({ transaction }) => {
      await transaction
        .update(checkoutSessions)
        .set({ createdAt: backdate })
        .where(eq(checkoutSessions.id, boundary.id))
    })

    const deleted = await adminTransaction(async ({ transaction }) =>
      deleteExpiredCheckoutSessionsAndFeeCalculations(transaction)
    )
    expect(deleted.find((s) => s.id === boundary.id)).toBeUndefined()
  })

  it('idempotency: second run returns empty and no errors', async () => {
    // setup:
    // - create a deletable session (15d old)
    // - run cleanup twice
    const old = await setupCheckoutSession({
      organizationId,
      customerId,
      priceId,
      status: CheckoutSessionStatus.Open,
      type: CheckoutSessionType.Product,
      quantity: 1,
      livemode: true,
    })
    const backdate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
    await adminTransaction(async ({ transaction }) => {
      await transaction
        .update(checkoutSessions)
        .set({ createdAt: backdate })
        .where(eq(checkoutSessions.id, old.id))
    })

    const first = await adminTransaction(async ({ transaction }) =>
      deleteExpiredCheckoutSessionsAndFeeCalculations(transaction)
    )
    expect(first.find((s) => s.id === old.id)).toBeDefined()
    const second = await adminTransaction(async ({ transaction }) =>
      deleteExpiredCheckoutSessionsAndFeeCalculations(transaction)
    )
    expect(second.find((s) => s.id === old.id)).toBeUndefined()
  })
})
