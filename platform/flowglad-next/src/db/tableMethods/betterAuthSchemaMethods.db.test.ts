/**
 * Database tests for betterAuthSchemaMethods (Patch 7).
 *
 * These tests verify the updateSessionContextOrganizationId function.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { session, user } from '@db-core/schema/betterAuthSchema'
import { eq } from 'drizzle-orm'
import { adminTransaction } from '@/db/adminTransaction'
import { db } from '@/db/client'
import { updateSessionContextOrganizationId } from './betterAuthSchemaMethods'

describe('updateSessionContextOrganizationId', () => {
  // Use unique IDs for each test run to avoid conflicts
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(7)}`
  const testUserId = `test_user_${uniqueId}`
  const testSessionId = `test_session_${uniqueId}`
  const testSessionToken = `test_token_${uniqueId}`

  beforeEach(async () => {
    // Create a test user first (due to foreign key constraint)
    await db.insert(user).values({
      id: testUserId,
      name: 'Test User',
      email: `test_${uniqueId}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Create a test session
    await db.insert(session).values({
      id: testSessionId,
      token: testSessionToken,
      userId: testUserId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      createdAt: new Date(),
      updatedAt: new Date(),
      scope: 'customer',
      contextOrganizationId: null,
    })
  })

  afterEach(async () => {
    // Clean up test session and user (session first due to FK)
    await db.delete(session).where(eq(session.id, testSessionId))
    await db.delete(user).where(eq(user.id, testUserId))
  })

  it('sets contextOrganizationId on an existing session by token', async () => {
    const orgId = 'org_test_123'

    await adminTransaction(async ({ transaction }) => {
      const result = await updateSessionContextOrganizationId(
        testSessionToken,
        orgId,
        transaction
      )
      expect(result?.contextOrganizationId).toBe(orgId)
    })

    // Verify the update persisted
    const [updatedSession] = await db
      .select()
      .from(session)
      .where(eq(session.id, testSessionId))

    expect(updatedSession.contextOrganizationId).toBe(orgId)
  })

  it('returns undefined when session token does not exist', async () => {
    const nonExistentToken = 'non_existent_token_123'
    const orgId = 'org_test_123'

    const result = await adminTransaction(async ({ transaction }) => {
      return updateSessionContextOrganizationId(
        nonExistentToken,
        orgId,
        transaction
      )
    })

    expect(result).toBeUndefined()
  })

  it('can update contextOrganizationId multiple times', async () => {
    const orgId1 = 'org_test_first'
    const orgId2 = 'org_test_second'

    // First update
    await adminTransaction(async ({ transaction }) => {
      const result = await updateSessionContextOrganizationId(
        testSessionToken,
        orgId1,
        transaction
      )
      expect(result?.contextOrganizationId).toBe(orgId1)
    })

    // Second update
    await adminTransaction(async ({ transaction }) => {
      const result = await updateSessionContextOrganizationId(
        testSessionToken,
        orgId2,
        transaction
      )
      expect(result?.contextOrganizationId).toBe(orgId2)
    })

    // Verify final state
    const [updatedSession] = await db
      .select()
      .from(session)
      .where(eq(session.id, testSessionId))

    expect(updatedSession.contextOrganizationId).toBe(orgId2)
  })
})
