import { beforeEach, describe, expect, it } from 'bun:test'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  setupOrg,
  setupProduct,
  setupProductFeature,
  setupToggleFeature,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { productFeatures } from '@/db/schema/productFeatures'
import { updateProductFeature } from '@/db/tableMethods/productFeatureMethods'
import { createDateNotPassedFilter } from '@/db/tableUtils'
import { zodEpochMs } from '@/db/timestampMs'

describe('zodEpochMs', () => {
  it('fails if parsing undefined', () => {
    const undefinedResult = zodEpochMs.safeParse(undefined)
    expect(undefinedResult.success).toBe(false)
  })

  it('parses Date instances to epoch milliseconds', () => {
    const date = new Date('2020-01-01T00:00:00.000Z')
    const result = zodEpochMs.parse(date)
    expect(result).toBe(date.getTime())
  })

  it('parses numbers (epoch ms) to epoch milliseconds', () => {
    const epochMs = 1712345678901
    const result = zodEpochMs.parse(epochMs)
    expect(result).toBe(epochMs)
  })

  it('parses ISO strings to epoch milliseconds and rejects invalid strings', () => {
    const iso = '2020-01-01T00:00:00.000Z'
    const parsedIso = zodEpochMs.parse(iso)
    expect(parsedIso).toBe(Date.parse(iso))

    const bad = 'not-a-date'
    const badResult = zodEpochMs.safeParse(bad)
    expect(badResult.success).toBe(false)
    /**
     * numeric string is not a valid date format.
     * Even new Date("1712345678901") throws an error in JS
     */
    const numericString = '1712345678901'
    const numericStringResult = zodEpochMs.safeParse(numericString)
    expect(numericStringResult.success).toBe(false)
  })

  it('rejects NaN', () => {
    // NaN is not a valid number for z.number()
    expect(zodEpochMs.safeParse(Number.NaN).success).toBe(false)
  })

  it('when optional, parses undefined successfully', () => {
    const optionalSchema = zodEpochMs.optional()
    const result = optionalSchema.safeParse(undefined)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBeUndefined()
    }

    // Also ensure it still parses a valid Date when optional
    const date = new Date('2021-06-15T12:34:56.000Z')
    const validResult = optionalSchema.parse(date)
    expect(validResult).toBe(date.getTime())
  })

  it('when nullable, parses null successfully', () => {
    const nullableSchema = zodEpochMs.nullable()
    const result = nullableSchema.safeParse(null)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBeNull()
    }
  })
})

describe('timestampWithTimezoneColumn with null values', () => {
  let orgId: string
  let productId: string
  let featureId: string

  beforeEach(async () => {
    const { organization, product } = (await setupOrg()).unwrap()
    orgId = organization.id
    productId = product.id

    const feature = await setupToggleFeature({
      organizationId: orgId,
      name: 'Test Feature',
      livemode: true,
    })
    featureId = feature.id
  })

  it('handles unspecified expiredAt (null by default)', async () => {
    // Insert a productFeature without specifying expiredAt
    const insertedFeature = await setupProductFeature({
      productId,
      featureId,
      organizationId: orgId,
      // expiredAt is not specified, should default to null
    })

    // Query the record back
    const queriedRecords = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return await transaction
        .select()
        .from(productFeatures)
        .where(eq(productFeatures.id, insertedFeature.id))
    })

    expect(queriedRecords).toHaveLength(1)
    const queriedRecord = queriedRecords[0]
    expect(queriedRecord.expiredAt).toBeNull()

    // Apply createDateNotPassedFilter and verify record is included
    const filteredRecords = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const filter = createDateNotPassedFilter(
        productFeatures.expiredAt
      )
      return await transaction
        .select()
        .from(productFeatures)
        .where(
          and(eq(productFeatures.id, insertedFeature.id), filter)
        )
    })

    expect(filteredRecords).toHaveLength(1)
    expect(filteredRecords[0].id).toBe(insertedFeature.id)
  })

  it('handles explicitly set expiredAt to null', async () => {
    // Insert a productFeature with expiredAt explicitly set to null
    const insertedFeature = await setupProductFeature({
      productId,
      featureId,
      organizationId: orgId,
      expiredAt: null,
    })

    // Query the record back
    const queriedRecords = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return await transaction
        .select()
        .from(productFeatures)
        .where(eq(productFeatures.id, insertedFeature.id))
    })

    expect(queriedRecords).toHaveLength(1)
    const queriedRecord = queriedRecords[0]
    expect(queriedRecord.expiredAt).toBeNull()

    // Apply createDateNotPassedFilter and verify record is included
    const filteredRecords = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const filter = createDateNotPassedFilter(
        productFeatures.expiredAt
      )
      return await transaction
        .select()
        .from(productFeatures)
        .where(
          and(eq(productFeatures.id, insertedFeature.id), filter)
        )
    })

    expect(filteredRecords).toHaveLength(1)
    expect(filteredRecords[0].id).toBe(insertedFeature.id)
  })

  it('distinguishes between null, expired, and non-expired records', async () => {
    // Insert a productFeature with null expiredAt
    const nullExpiredFeature = await setupProductFeature({
      productId,
      featureId: featureId,
      organizationId: orgId,
      expiredAt: null,
    })

    // Create another feature and product for the expired case
    const expiredFeature = await setupToggleFeature({
      organizationId: orgId,
      name: 'Expired Feature',
      livemode: true,
    })

    // Insert a productFeature with expiredAt in the past
    const pastDate = new Date('2020-01-01T00:00:00.000Z').getTime()
    const expiredProductFeature = await setupProductFeature({
      productId,
      featureId: expiredFeature.id,
      organizationId: orgId,
      expiredAt: pastDate,
    })

    // Create another feature and product for the future case
    const futureFeature = await setupToggleFeature({
      organizationId: orgId,
      name: 'Future Feature',
      livemode: true,
    })

    // Insert a productFeature with expiredAt in the future
    const futureDate = new Date('2099-01-01T00:00:00.000Z').getTime()
    const futureProductFeature = await setupProductFeature({
      productId,
      featureId: futureFeature.id,
      organizationId: orgId,
      expiredAt: futureDate,
    })

    // Apply createDateNotPassedFilter and verify:
    // - null expiredAt record IS included
    // - past expiredAt record is NOT included
    // - future expiredAt record IS included
    const filteredRecords = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const filter = createDateNotPassedFilter(
        productFeatures.expiredAt
      )
      return await transaction
        .select()
        .from(productFeatures)
        .where(filter)
    })

    const filteredIds = filteredRecords.map((r) => r.id)

    // Null expiredAt should be included (not expired)
    expect(filteredIds).toContain(nullExpiredFeature.id)

    // Future expiredAt should be included (not expired yet)
    expect(filteredIds).toContain(futureProductFeature.id)

    // Past expiredAt should NOT be included (expired)
    expect(filteredIds).not.toContain(expiredProductFeature.id)
  })

  it('handles setting expiredAt to a value and then back to null', async () => {
    // Insert a productFeature with null expiredAt
    const insertedFeature = await setupProductFeature({
      productId,
      featureId,
      organizationId: orgId,
      expiredAt: null,
    })

    // Verify initial null state
    const initialRecords = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return await transaction
        .select()
        .from(productFeatures)
        .where(eq(productFeatures.id, insertedFeature.id))
    })

    expect(initialRecords).toHaveLength(1)
    expect(initialRecords[0].expiredAt).toBeNull()

    // Update to a past date value
    const pastDate = new Date('2020-01-01T00:00:00.000Z').getTime()
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      await updateProductFeature(
        {
          id: insertedFeature.id,
          expiredAt: pastDate,
        },
        ctx
      )
    })

    // Verify it was updated to the past date
    const updatedRecords = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return await transaction
        .select()
        .from(productFeatures)
        .where(eq(productFeatures.id, insertedFeature.id))
    })

    expect(updatedRecords).toHaveLength(1)
    expect(updatedRecords[0].expiredAt).toBe(pastDate)

    // Verify it would be filtered out (expired)
    const filteredOutRecords = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const filter = createDateNotPassedFilter(
        productFeatures.expiredAt
      )
      return await transaction
        .select()
        .from(productFeatures)
        .where(
          and(eq(productFeatures.id, insertedFeature.id), filter)
        )
    })

    expect(filteredOutRecords).toHaveLength(0)

    // Update back to null using the helper function
    await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      await updateProductFeature(
        {
          id: insertedFeature.id,
          expiredAt: null,
        },
        ctx
      )
    })

    // Verify it's back to null
    const nullAgainRecords = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return await transaction
        .select()
        .from(productFeatures)
        .where(eq(productFeatures.id, insertedFeature.id))
    })

    expect(nullAgainRecords).toHaveLength(1)
    expect(nullAgainRecords[0].expiredAt).toBeNull()

    // Verify it passes the filter again (not expired)
    const filteredInRecords = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const filter = createDateNotPassedFilter(
        productFeatures.expiredAt
      )
      return await transaction
        .select()
        .from(productFeatures)
        .where(
          and(eq(productFeatures.id, insertedFeature.id), filter)
        )
    })

    expect(filteredInRecords).toHaveLength(1)
    expect(filteredInRecords[0].id).toBe(insertedFeature.id)
  })
})
