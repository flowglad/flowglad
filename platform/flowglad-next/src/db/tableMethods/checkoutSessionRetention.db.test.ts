import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  IntervalUnit,
  PriceType,
} from '@db-core/enums'
import { checkoutSessions } from '@db-core/schema/checkoutSessions'
import { Result } from 'better-result'
import { eq } from 'drizzle-orm'
import {
  setupCheckoutSession,
  setupCustomer,
  setupFeeCalculation,
  setupOrg,
  setupPrice,
  teardownOrg,
} from '@/../seedDatabase'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import {
  deleteExpiredCheckoutSessionsAndFeeCalculations,
  selectCheckoutSessionById,
} from './checkoutSessionMethods'

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
    const backdate =
      Date.now() -
      fifteenDaysMs(
        await adminTransactionWithResult(async ({ transaction }) => {
          await transaction
            .update(checkoutSessions)
            .set({ createdAt: backdate })
            .where(eq(checkoutSessions.id, old.id))
          return Result.ok(undefined)
        })
      ).unwrap()

    const deleted = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await deleteExpiredCheckoutSessionsAndFeeCalculations(
            transaction
          )
        )
      })
    ).unwrap()

    expect(deleted.find((s) => s.id === old.id)).toMatchObject({
      id: old.id,
    })
    expect(deleted.find((s) => s.id === recent.id)).toBeUndefined()
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await selectCheckoutSessionById(
          old.id,
          transaction
        )
        expect(Result.isError(result)).toBe(true)
        return Result.ok(undefined)
      })
    ).unwrap()
    const recentStillThere = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await (
            await selectCheckoutSessionById(recent.id, transaction)
          ).unwrap()
        )
      })
    ).unwrap()
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
    const backdate = Date.now() - fifteenDaysMs
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        await transaction
          .update(checkoutSessions)
          .set({ createdAt: backdate })
          .where(eq(checkoutSessions.id, oldSucceeded.id))
        await transaction
          .update(checkoutSessions)
          .set({ createdAt: backdate })
          .where(eq(checkoutSessions.id, oldPending.id))
        return Result.ok(undefined)
      })
    ).unwrap()

    const deleted = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await deleteExpiredCheckoutSessionsAndFeeCalculations(
            transaction
          )
        )
      })
    ).unwrap()
    expect(
      deleted.find((s) => s.id === oldSucceeded.id)
    ).toBeUndefined()
    expect(
      deleted.find((s) => s.id === oldPending.id)
    ).toBeUndefined()
    // ensure both still present
    const s1 = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await (
            await selectCheckoutSessionById(
              oldSucceeded.id,
              transaction
            )
          ).unwrap()
        )
      })
    ).unwrap()
    const s2 = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await (
            await selectCheckoutSessionById(
              oldPending.id,
              transaction
            )
          ).unwrap()
        )
      })
    ).unwrap()
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
    const backdate = Date.now() - fifteenDaysMs
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        await transaction
          .update(checkoutSessions)
          .set({ createdAt: backdate })
          .where(eq(checkoutSessions.id, old.id))
        return Result.ok(undefined)
      })
    ).unwrap()
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

    const deleted = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await deleteExpiredCheckoutSessionsAndFeeCalculations(
            transaction
          )
        )
      })
    ).unwrap()
    expect(deleted.find((s) => s.id === old.id)).toMatchObject({
      id: old.id,
    })
    // Verify feeCalculation for old is gone by attempting to re-delete returns empty
    const secondRun = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await deleteExpiredCheckoutSessionsAndFeeCalculations(
            transaction
          )
        )
      })
    ).unwrap()
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
    const result = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await deleteExpiredCheckoutSessionsAndFeeCalculations(
            transaction
          )
        )
      })
    ).unwrap()
    expect(result.find((s) => s.id === recent.id)).toBeUndefined()
    const stillThere = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await (
            await selectCheckoutSessionById(recent.id, transaction)
          ).unwrap()
        )
      })
    ).unwrap()
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
      const backdate = Date.now() - 15 * 24 * 60 * 60 * 1000
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await transaction
            .update(checkoutSessions)
            .set({ createdAt: backdate })
            .where(eq(checkoutSessions.id, s.id))
          return Result.ok(undefined)
        })
      ).unwrap()
      return s
    }
    const sOpen = await createOld(CheckoutSessionStatus.Open)
    const sFailed = await createOld(CheckoutSessionStatus.Failed)
    const sExpired = await createOld(CheckoutSessionStatus.Expired)
    const sSucceeded = await createOld(
      CheckoutSessionStatus.Succeeded
    )
    const sPending = await createOld(CheckoutSessionStatus.Pending)

    const deleted = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await deleteExpiredCheckoutSessionsAndFeeCalculations(
            transaction
          )
        )
      })
    ).unwrap()
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
    const backdate = Date.now() - 14 * 24 * 60 * 60 * 1000 + 60 * 1000
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        await transaction
          .update(checkoutSessions)
          .set({ createdAt: backdate })
          .where(eq(checkoutSessions.id, boundary.id))
        return Result.ok(undefined)
      })
    ).unwrap()

    const deleted = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await deleteExpiredCheckoutSessionsAndFeeCalculations(
            transaction
          )
        )
      })
    ).unwrap()
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
    const backdate = Date.now() - 15 * 24 * 60 * 60 * 1000
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        await transaction
          .update(checkoutSessions)
          .set({ createdAt: backdate })
          .where(eq(checkoutSessions.id, old.id))
        return Result.ok(undefined)
      })
    ).unwrap()

    const first = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await deleteExpiredCheckoutSessionsAndFeeCalculations(
            transaction
          )
        )
      })
    ).unwrap()
    expect(first.find((s) => s.id === old.id)).toMatchObject({
      id: old.id,
    })
    const second = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await deleteExpiredCheckoutSessionsAndFeeCalculations(
            transaction
          )
        )
      })
    ).unwrap()
    expect(second.find((s) => s.id === old.id)).toBeUndefined()
  })
})
