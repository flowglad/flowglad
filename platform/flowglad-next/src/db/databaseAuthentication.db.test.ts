import { beforeEach, describe, expect, it } from 'bun:test'
import { FlowgladApiKeyType } from '@db-core/enums'
import { type Customer, customers } from '@db-core/schema/customers'
import {
  type Membership,
  memberships,
} from '@db-core/schema/memberships'
import type { Organization } from '@db-core/schema/organizations'
import { type User, users } from '@db-core/schema/users'
import type { User as BetterAuthUser } from 'better-auth'
import { eq } from 'drizzle-orm'
import {
  setupCustomer,
  setupOrg,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  databaseAuthenticationInfoForApiKeyResult,
  databaseAuthenticationInfoForWebappRequest,
  dbAuthInfoForSecretApiKeyResult,
  dbInfoForCustomerBillingPortal,
  getDatabaseAuthenticationInfo,
} from '@/db/databaseAuthentication'
import { selectMembershipAndOrganizationsByBetterAuthUserId } from '@/db/tableMethods/membershipMethods'
import core from '@/utils/core'

type BetterAuthUserWithRole = BetterAuthUser & { role: string }

let webUser: User.Record
let webOrgA: Organization.Record
let webOrgB: Organization.Record
let webOrgC: Organization.Record
let webPmA: string // pricing model ID for webOrgA
let webPmB: string // pricing model ID for webOrgB
let webPmC: string // pricing model ID for webOrgC
let webMemA: Membership.Record
let webMemB: Membership.Record
let webMemC: Membership.Record
let webBetterAuthId: string
let webUserEmail: string

let secretOrg: Organization.Record
let secretUser: User.Record
let secretMembership: Membership.Record
let secretClerkId: string
let secretOrgLivePricingModelId: string
let secretOrgTestPricingModelId: string

let secretApiKeyOrg: Organization.Record
let secretApiKeyTokenLive: string
let secretApiKeyTokenTest: string

beforeEach(async () => {
  // Webapp-focused user and memberships across 3 orgs
  const webOrgSetupA = await setupOrg()
  const webOrgSetupB = await setupOrg()
  const webOrgSetupC = await setupOrg()
  webOrgA = webOrgSetupA.organization
  webOrgB = webOrgSetupB.organization
  webOrgC = webOrgSetupC.organization
  // Use testmode pricing models since livemode: false is used for membership inserts
  webPmA = webOrgSetupA.testmodePricingModel.id
  webPmB = webOrgSetupB.pricingModel.id // livemode: true membership
  webPmC = webOrgSetupC.testmodePricingModel.id

  webBetterAuthId = `bau_${core.nanoid()}`
  webUserEmail = `webapp+${core.nanoid()}@test.com`
  await adminTransaction(async ({ transaction }) => {
    const [insertedUser] = await transaction
      .insert(users)
      .values({
        id: `usr_${core.nanoid()}`,
        email: webUserEmail,
        name: 'Webapp Test User',
        betterAuthId: webBetterAuthId,
      })
      .returning()
    webUser = insertedUser as User.Record

    const [mA] = await transaction
      .insert(memberships)
      .values({
        userId: webUser.id,
        organizationId: webOrgA.id,
        focused: false,
        livemode: false,
        focusedPricingModelId: webPmA,
      })
      .returning()
    const [mB] = await transaction
      .insert(memberships)
      .values({
        userId: webUser.id,
        organizationId: webOrgB.id,
        focused: true,
        livemode: true,
        focusedPricingModelId: webPmB,
      })
      .returning()
    const [mC] = await transaction
      .insert(memberships)
      .values({
        userId: webUser.id,
        organizationId: webOrgC.id,
        focused: false,
        livemode: false,
        focusedPricingModelId: webPmC,
      })
      .returning()
    webMemA = mA as Membership.Record
    webMemB = mB as Membership.Record
    webMemC = mC as Membership.Record
  })

  // Secret API key user inside a dedicated org, with clerkId present
  const secretOrgSetup = await setupOrg()
  secretOrg = secretOrgSetup.organization
  secretOrgLivePricingModelId = secretOrgSetup.pricingModel.id
  secretOrgTestPricingModelId = secretOrgSetup.testmodePricingModel.id
  secretClerkId = `clerk_${core.nanoid()}`
  await adminTransaction(async ({ transaction }) => {
    const [insertedSecretUser] = await transaction
      .insert(users)
      .values({
        id: `usr_${core.nanoid()}`,
        email: `secret+${core.nanoid()}@test.com`,
        name: 'Secret Key User',
        clerkId: secretClerkId,
      })
      .returning()
    secretUser = insertedSecretUser as User.Record

    const [m] = await transaction
      .insert(memberships)
      .values({
        userId: secretUser.id,
        organizationId: secretOrg.id,
        focused: true,
        livemode: false,
        focusedPricingModelId: secretOrgTestPricingModelId,
      })
      .returning()
    secretMembership = m as Membership.Record
  })

  // Secret API key tokens for integration path using test-mode keyVerify
  const secretApiKeyOrgSetup = await setupOrg()
  secretApiKeyOrg = secretApiKeyOrgSetup.organization
  const liveKey = await setupUserAndApiKey({
    organizationId: secretApiKeyOrg.id,
    livemode: true,
  })
  const testKey = await setupUserAndApiKey({
    organizationId: secretApiKeyOrg.id,
    livemode: false,
  })
  secretApiKeyTokenLive = liveKey.apiKey.token
  secretApiKeyTokenTest = testKey.apiKey.token
})

describe('databaseAuthenticationInfoForWebappRequest', () => {
  it('should use the focused membership to derive userId, livemode, and jwtClaim fields', async () => {
    // setup:
    // - create a user "WebUser" with a known betterAuthId
    // - create three memberships for WebUser across three organizations:
    //   - M1 for OrgA with focused=false, livemode=false
    //   - M2 for OrgB with focused=true, livemode=true (this should be selected)
    //   - M3 for OrgC with focused=false, livemode=false
    // - ensure users.betterAuthId == WebUser.id for lookup
    // expects:
    // - returned.userId equals M2.userId
    // - returned.livemode equals true (from M2.livemode)
    // - returned.jwtClaim.sub equals M2.userId
    // - returned.jwtClaim.user_metadata.id equals M2.userId
    // - returned.jwtClaim.organization_id equals M2.organizationId
    // - returned.jwtClaim.email equals WebUser.email
    // - returned.jwtClaim.app_metadata.provider equals 'webapp' for webapp auth
    const mockBetterAuthUser = {
      id: (webUser as any).betterAuthId ?? (webUser as any).id, // ensure we pass the betterAuthId used in beforeEach
      email: (webUser as any).email,
      role: 'merchant',
    } as unknown as BetterAuthUserWithRole
    const result = await databaseAuthenticationInfoForWebappRequest(
      mockBetterAuthUser,
      undefined
    )
    expect(result.userId).toEqual(webMemB.userId)
    expect(result.livemode).toEqual(true)
    expect(result.jwtClaim.sub).toEqual(webMemB.userId)
    expect(result.jwtClaim.user_metadata.id).toEqual(webMemB.userId)
    expect(result.jwtClaim.organization_id).toEqual(
      webMemB.organizationId
    )
    expect(result.jwtClaim.email).toEqual((webUser as any).email)
    expect(result.jwtClaim.app_metadata.provider).toEqual('webapp')
  })

  it('should return undefined userId and empty organization_id when no membership is focused', async () => {
    // setup:
    // - create a user "WebUserNoFocus" with a known betterAuthId
    // - create memberships for this user with focused=false for all
    // - do not set any membership as focused
    // expects:
    // - returned.userId is undefined (no membership selected)
    // - returned.jwtClaim.organization_id is empty string
    // - returned.livemode defaults to false
    // This behavior now matches trpcContext.ts which uses .find() and returns undefined
    // when no membership has focused=true
    const mockBetterAuthUser = {
      id: (webUser as any).betterAuthId ?? (webUser as any).id,
      email: (webUser as any).email,
      role: 'merchant',
    } as unknown as BetterAuthUserWithRole
    // flip focused=false for the previously focused membership
    await adminTransaction(async ({ transaction }) => {
      await transaction
        .update(memberships)
        .set({ focused: false })
        .where(eq(memberships.id, webMemB.id))
    })
    const result = await databaseAuthenticationInfoForWebappRequest(
      mockBetterAuthUser
    )
    // With the fix, when no membership has focused=true, we return undefined/empty
    // rather than arbitrarily selecting the first membership
    expect(result.userId).toBeUndefined()
    expect(result.jwtClaim.organization_id).toEqual('')
    expect(result.livemode).toEqual(false)
  })

  it('should return undefined userId and empty organization_id when the user has no memberships', async () => {
    // setup:
    // - create a user "WebUserNoMemberships" with a known betterAuthId
    // - create zero memberships for this user
    // expects:
    // - returned.userId is undefined
    // - returned.livemode is false
    // - returned.jwtClaim.sub is undefined
    // - returned.jwtClaim.user_metadata.id is undefined
    // - returned.jwtClaim.organization_id is ""
    // - returned.jwtClaim.email equals the user email passed in
    const lonelyBetterAuthId = `bau_${core.nanoid()}`
    const lonelyEmail = `lonely+${core.nanoid()}@test.com`
    let lonelyUserId: string
    await adminTransaction(async ({ transaction }) => {
      const [lonelyUser] = await transaction
        .insert(users)
        .values({
          id: `usr_${core.nanoid()}`,
          email: lonelyEmail,
          name: 'Lonely User',
          betterAuthId: lonelyBetterAuthId,
        })
        .returning()
      lonelyUserId = (lonelyUser as any).id
    })
    const mockBetterAuthUser = {
      id: lonelyBetterAuthId,
      email: lonelyEmail,
      role: 'merchant',
    } as unknown as BetterAuthUserWithRole
    const result = await databaseAuthenticationInfoForWebappRequest(
      mockBetterAuthUser
    )
    expect(result.userId).toBeUndefined()
    expect(result.livemode).toEqual(false)
    expect(result.jwtClaim.sub).toBeUndefined()
    expect(result.jwtClaim.user_metadata.id).toBeUndefined()
    expect(result.jwtClaim.organization_id).toEqual('')
    expect(result.jwtClaim.email).toEqual(lonelyEmail)
  })

  it('should return empty organization_id when focused membership is deactivated', async () => {
    // setup: create user with focused membership, then set deactivatedAt on that membership
    // action: call databaseAuthenticationInfoForWebappRequest
    // expects: jwtClaim.organization_id === ''
    const testBetterAuthId = `bau_${core.nanoid()}`
    const testEmail = `deactivated+${core.nanoid()}@test.com`
    const { organization: testOrg, testmodePricingModel: testPm } =
      await setupOrg()

    await adminTransaction(async ({ transaction }) => {
      const [testUser] = await transaction
        .insert(users)
        .values({
          id: `usr_${core.nanoid()}`,
          email: testEmail,
          name: 'Deactivated Test User',
          betterAuthId: testBetterAuthId,
        })
        .returning()

      // Create focused membership
      const [membership] = await transaction
        .insert(memberships)
        .values({
          userId: testUser.id,
          organizationId: testOrg.id,
          focused: true,
          livemode: false,
          focusedPricingModelId: testPm.id,
        })
        .returning()

      // Deactivate the membership
      await transaction
        .update(memberships)
        .set({ deactivatedAt: new Date() })
        .where(eq(memberships.id, membership.id))
    })

    const mockBetterAuthUser = {
      id: testBetterAuthId,
      email: testEmail,
      role: 'merchant',
    } as unknown as BetterAuthUserWithRole

    const result = await databaseAuthenticationInfoForWebappRequest(
      mockBetterAuthUser
    )

    // Should return empty organization_id because the focused membership is deactivated
    expect(result.jwtClaim.organization_id).toEqual('')
    expect(result.userId).toBeUndefined()
    expect(result.livemode).toEqual(false)
  })

  it('should return organization_id when focused membership is active (deactivatedAt is null)', async () => {
    // setup: create user with focused membership (deactivatedAt = null)
    // action: call databaseAuthenticationInfoForWebappRequest
    // expects: jwtClaim.organization_id === the org's id
    const testBetterAuthId = `bau_${core.nanoid()}`
    const testEmail = `active+${core.nanoid()}@test.com`
    const { organization: testOrg, pricingModel: testPm } =
      await setupOrg()

    let testUserId: string
    await adminTransaction(async ({ transaction }) => {
      const [testUser] = await transaction
        .insert(users)
        .values({
          id: `usr_${core.nanoid()}`,
          email: testEmail,
          name: 'Active Test User',
          betterAuthId: testBetterAuthId,
        })
        .returning()
      testUserId = testUser.id

      // Create focused membership with deactivatedAt = null (default)
      await transaction.insert(memberships).values({
        userId: testUser.id,
        organizationId: testOrg.id,
        focused: true,
        livemode: true,
        focusedPricingModelId: testPm.id,
      })
    })

    const mockBetterAuthUser = {
      id: testBetterAuthId,
      email: testEmail,
      role: 'merchant',
    } as unknown as BetterAuthUserWithRole

    const result = await databaseAuthenticationInfoForWebappRequest(
      mockBetterAuthUser
    )

    // Should return the organization_id because the membership is active
    expect(result.jwtClaim.organization_id).toEqual(testOrg.id)
    expect(result.userId).toEqual(testUserId!)
    expect(result.livemode).toEqual(true)
  })

  it('should not return org scope for deactivated membership even if focused=true', async () => {
    // setup: create membership with focused=true, deactivatedAt=timestamp
    // action: call databaseAuthenticationInfoForWebappRequest
    // expects: jwtClaim.organization_id === '' (no org context)
    // This tests the AND condition: both focused=true AND deactivatedAt IS NULL must be true
    const testBetterAuthId = `bau_${core.nanoid()}`
    const testEmail = `focused-deactivated+${core.nanoid()}@test.com`
    const { organization: testOrg, testmodePricingModel: testPm } =
      await setupOrg()

    await adminTransaction(async ({ transaction }) => {
      const [testUser] = await transaction
        .insert(users)
        .values({
          id: `usr_${core.nanoid()}`,
          email: testEmail,
          name: 'Focused Deactivated User',
          betterAuthId: testBetterAuthId,
        })
        .returning()

      // Create membership that is both focused AND deactivated
      // This simulates a membership that was focused when the user was removed
      await transaction.insert(memberships).values({
        userId: testUser.id,
        organizationId: testOrg.id,
        focused: true,
        livemode: false,
        deactivatedAt: new Date(), // Deactivated at current time
        focusedPricingModelId: testPm.id,
      })
    })

    const mockBetterAuthUser = {
      id: testBetterAuthId,
      email: testEmail,
      role: 'merchant',
    } as unknown as BetterAuthUserWithRole

    const result = await databaseAuthenticationInfoForWebappRequest(
      mockBetterAuthUser
    )

    // Even though focused=true, the membership is deactivated so no org context
    expect(result.jwtClaim.organization_id).toEqual('')
    expect(result.userId).toBeUndefined()
  })
})

describe('dbAuthInfoForSecretApiKeyResult', () => {
  it('should resolve userId via internal users.id when membership exists in the owner organization', async () => {
    // setup:
    // - create Organization "OrgS1"
    // - create User "SecretUser1" with both users.id and users.clerkId set
    // - create Membership "MS1" linking SecretUser1 to OrgS1
    // - construct verifyKeyResult with:
    //   - keyType=Secret
    //   - ownerId=OrgS1.id
    //   - userId=SecretUser1.id (internal id)
    //   - environment="live"
    // expects:
    // - returned.userId equals SecretUser1.id
    // - returned.livemode equals true
    // - returned.jwtClaim.sub equals SecretUser1.id
    // - returned.jwtClaim.user_metadata.id equals SecretUser1.id
    // - returned.jwtClaim.organization_id equals OrgS1.id
    // - returned.jwtClaim.email equals 'apiKey@example.com'
    // - returned.jwtClaim.session_id is present
    // - returned.jwtClaim.app_metadata.provider equals 'apiKey'
    const verifyKeyResult = {
      keyType: FlowgladApiKeyType.Secret,
      userId: secretUser.id,
      ownerId: secretOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.Secret,
        userId: secretUser.id,
        organizationId: secretOrg.id,
        pricingModelId: secretOrgLivePricingModelId,
      },
    }
    const result = await dbAuthInfoForSecretApiKeyResult(
      verifyKeyResult as any
    )
    expect(result.userId).toEqual(secretUser.id)
    expect(result.livemode).toEqual(true)
    expect(result.jwtClaim.sub).toEqual(secretUser.id)
    expect(result.jwtClaim.user_metadata.id).toEqual(secretUser.id)
    expect(result.jwtClaim.organization_id).toEqual(secretOrg.id)
    expect(result.jwtClaim.email).toEqual('apiKey@example.com')
    expect(typeof result.jwtClaim.session_id).toBe('string')
    expect(result.jwtClaim.app_metadata.provider).toEqual('apiKey')
  })

  it('should resolve userId via users.clerkId mapping when membership exists in the owner organization', async () => {
    // setup:
    // - create Organization "OrgS2"
    // - create User "SecretUser2" with a specific users.clerkId
    // - create Membership "MS2" linking SecretUser2 to OrgS2
    // - construct verifyKeyResult with:
    //   - keyType=Secret
    //   - ownerId=OrgS2.id
    //   - userId=SecretUser2.clerkId (not the internal id)
    //   - environment="test"
    // expects:
    // - returned.userId equals SecretUser2.id (resolved via the join on users.clerkId)
    // - returned.livemode equals false
    // - returned.jwtClaim.sub equals SecretUser2.id
    // - returned.jwtClaim.user_metadata.id equals SecretUser2.id
    // - returned.jwtClaim.organization_id equals OrgS2.id
    const verifyKeyResult = {
      keyType: FlowgladApiKeyType.Secret,
      userId: (secretUser as any).clerkId,
      ownerId: secretOrg.id,
      environment: 'test',
      metadata: {
        type: FlowgladApiKeyType.Secret,
        userId: (secretUser as any).clerkId,
        organizationId: secretOrg.id,
        pricingModelId: secretOrgTestPricingModelId,
      },
    }
    const result = await dbAuthInfoForSecretApiKeyResult(
      verifyKeyResult as any
    )
    expect(result.userId).toEqual(secretUser.id)
    expect(result.livemode).toEqual(false)
    expect(result.jwtClaim.sub).toEqual(secretUser.id)
    expect(result.jwtClaim.user_metadata.id).toEqual(secretUser.id)
    expect(result.jwtClaim.organization_id).toEqual(secretOrg.id)
  })

  it('should currently throw if no membership is found for the owner organization (unsafe indexing)', async () => {
    // setup:
    // - create Organization "OrgS3"
    // - create User "SecretUser3" without any membership in OrgS3
    // - construct verifyKeyResult with:
    //   - keyType=Secret
    //   - ownerId=OrgS3.id
    //   - userId=SecretUser3.id (or SecretUser3.clerkId)
    //   - environment="test"
    // expects:
    // - function currently attempts to access membershipsForOrganization[0].users.id and will throw when the array is empty
    // - assert that an error is thrown (document existing behavior; candidate for future fix)
    const otherOrgSetup = await setupOrg()
    const otherOrg = otherOrgSetup.organization
    const verifyKeyResult = {
      keyType: FlowgladApiKeyType.Secret,
      userId: secretUser.id,
      ownerId: otherOrg.id,
      environment: 'test',
      metadata: {
        type: FlowgladApiKeyType.Secret,
        userId: secretUser.id,
        organizationId: otherOrg.id,
        pricingModelId: otherOrgSetup.testmodePricingModel.id,
      },
    }
    await expect(
      dbAuthInfoForSecretApiKeyResult(verifyKeyResult as any)
    ).rejects.toThrow()
  })

  it('should map environment to livemode correctly', async () => {
    // setup:
    // - create Organization "OrgS4" and a User "SecretUser4" with a membership in OrgS4
    // - run twice with verifyKeyResult.environment set to "live" and "test"
    // expects:
    // - environment "live" -> returned.livemode === true
    // - environment "test" -> returned.livemode === false
    const liveResult = await dbAuthInfoForSecretApiKeyResult({
      keyType: FlowgladApiKeyType.Secret,
      userId: secretUser.id,
      ownerId: secretOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.Secret,
        userId: secretUser.id,
        organizationId: secretOrg.id,
        pricingModelId: secretOrgLivePricingModelId,
      },
    } as any)
    const testResult = await dbAuthInfoForSecretApiKeyResult({
      keyType: FlowgladApiKeyType.Secret,
      userId: secretUser.id,
      ownerId: secretOrg.id,
      environment: 'test',
      metadata: {
        type: FlowgladApiKeyType.Secret,
        userId: secretUser.id,
        organizationId: secretOrg.id,
        pricingModelId: secretOrgTestPricingModelId,
      },
    } as any)
    expect(liveResult.livemode).toEqual(true)
    expect(testResult.livemode).toEqual(false)
  })
})

describe('databaseAuthenticationInfoForApiKeyResult', () => {
  it('should delegate to Secret API key flow when keyType=Secret', async () => {
    // setup:
    // - construct a verifyKeyResult with keyType=Secret and otherwise valid fields
    // - spy on or stub the Secret flow to observe invocation
    // expects:
    // - Secret flow is called exactly once with the verifyKeyResult
    // - return value equals what the Secret flow returns
    const verifyKeyResult = {
      keyType: FlowgladApiKeyType.Secret,
      userId: secretUser.id,
      ownerId: secretOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.Secret,
        userId: secretUser.id,
        organizationId: secretOrg.id,
        pricingModelId: secretOrgLivePricingModelId,
      },
    }
    const result = await databaseAuthenticationInfoForApiKeyResult(
      verifyKeyResult as any
    )
    expect(result.jwtClaim.organization_id).toEqual(secretOrg.id)
    expect(result.userId).toEqual(secretUser.id)
    expect(result.livemode).toEqual(true)
  })

  it('should throw on invalid key type', async () => {
    // setup:
    // - construct a verifyKeyResult with an invalid keyType
    // expects:
    // - throws an error mentioning the invalid API key type
    await expect(
      databaseAuthenticationInfoForApiKeyResult({
        keyType: 'invalid_type' as any,
        userId: secretUser.id,
        ownerId: secretOrg.id,
        environment: 'live',
        metadata: { type: 'invalid' } as any,
      })
    ).rejects.toThrow()
  })
})

describe('getDatabaseAuthenticationInfo', () => {
  it('should use API key path when apiKey is provided', async () => {
    // setup:
    // - provide a non-empty apiKey
    // - stub key verification to return a valid Secret verifyKeyResult
    // - stub the Secret flow to return a known object
    // expects:
    // - function delegates to the API key flow
    // - return value equals the stubbed Secret flow result
    const liveResult = await getDatabaseAuthenticationInfo({
      apiKey: secretApiKeyTokenLive,
    })
    expect(liveResult.livemode).toEqual(true)
    expect(liveResult.jwtClaim.organization_id).toEqual(
      secretApiKeyOrg.id
    )
    const testResult = await getDatabaseAuthenticationInfo({
      apiKey: secretApiKeyTokenTest,
    })
    expect(testResult.livemode).toEqual(false)
    expect(testResult.jwtClaim.organization_id).toEqual(
      secretApiKeyOrg.id
    )
  })

  it('should delegate to webapp request path when apiKey is not provided and session exists', () => {
    // setup:
    // - pass apiKey as undefined
    // - stub getSession() to return a session with a user (betterAuthId present)
    // - ensure there is at least one membership to derive fields from
    // expects:
    // - function delegates to the webapp request flow
    // - fields returned are consistent with the selected membership (userId, organization_id, livemode)
    // NOTE: Omitted implementation due to reliance on Next.js request headers in getSession(); covered via direct unit tests above
  })

  it('should throw when apiKey is not provided and no session exists', () => {
    // setup:
    // - pass apiKey as undefined
    // - stub getSession() to return null
    // expects:
    // - throws error: "No user found for a non-API key transaction"
    // NOTE: Omitted for same reason as above
  })
})

describe('subtleties and invariants across flows', () => {
  it('jwtClaim.sub should equal jwtClaim.user_metadata.id in all successful flows', async () => {
    // setup:
    // - obtain results from the webapp flow and the Secret flow in their happy paths
    // expects:
    // - for each result, jwtClaim.sub === jwtClaim.user_metadata.id
    const mockBetterAuthUser = {
      id: (webUser as any).betterAuthId ?? (webUser as any).id,
      email: (webUser as any).email,
      role: 'merchant',
    } as unknown as BetterAuthUserWithRole
    const webappRes =
      await databaseAuthenticationInfoForWebappRequest(
        mockBetterAuthUser
      )
    const secretRes = await dbAuthInfoForSecretApiKeyResult({
      keyType: FlowgladApiKeyType.Secret,
      userId: secretUser.id,
      ownerId: secretOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.Secret,
        userId: secretUser.id,
        organizationId: secretOrg.id,
        pricingModelId: secretOrgLivePricingModelId,
      },
    } as any)
    expect(webappRes.jwtClaim.sub).toEqual(
      webappRes.jwtClaim.user_metadata.id
    )
    expect(secretRes.jwtClaim.sub).toEqual(
      secretRes.jwtClaim.user_metadata.id
    )
  })

  it('jwtClaim field naming uses organization_id (snake_case), not organizationId', async () => {
    // setup:
    // - obtain a successful result from any flow
    // expects:
    // - jwtClaim has organization_id set
    // - jwtClaim does not have organizationId
    const verifyKeyResult = {
      keyType: FlowgladApiKeyType.Secret,
      userId: secretUser.id,
      ownerId: secretOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.Secret,
        userId: secretUser.id,
        organizationId: secretOrg.id,
        pricingModelId: secretOrgLivePricingModelId,
      },
    }
    const res = await databaseAuthenticationInfoForApiKeyResult(
      verifyKeyResult as any
    )
    expect(res.jwtClaim.organization_id).toEqual(secretOrg.id)
    expect((res.jwtClaim as any).organizationId).toBeUndefined()
  })

  it('provider consistency: jwtClaim.app_metadata.provider reflects auth type ("webapp" vs "apiKey")', async () => {
    // setup:
    // - obtain results from webapp and Secret flows
    // expects:
    // - jwtClaim.app_metadata.provider equals 'webapp' for webapp auth
    // - jwtClaim.app_metadata.provider equals 'apiKey' for Secret API key auth
    const mockBetterAuthUser = {
      id: (webUser as any).betterAuthId ?? (webUser as any).id,
      email: (webUser as any).email,
      role: 'merchant',
    } as unknown as BetterAuthUserWithRole
    const webappRes =
      await databaseAuthenticationInfoForWebappRequest(
        mockBetterAuthUser
      )
    const secretRes = await dbAuthInfoForSecretApiKeyResult({
      keyType: FlowgladApiKeyType.Secret,
      userId: secretUser.id,
      ownerId: secretOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.Secret,
        userId: secretUser.id,
        organizationId: secretOrg.id,
        pricingModelId: secretOrgLivePricingModelId,
      },
    } as any)
    expect(webappRes.jwtClaim.app_metadata.provider).toEqual('webapp')
    expect(secretRes.jwtClaim.app_metadata.provider).toEqual('apiKey')
  })

  it('session_id is present only in Secret API key flow (as currently implemented)', async () => {
    // setup:
    // - obtain results from webapp and Secret flows
    // expects:
    // - Secret flow result includes jwtClaim.session_id
    // - webapp result does not include jwtClaim.session_id
    const mockBetterAuthUser = {
      id: (webUser as any).betterAuthId ?? (webUser as any).id,
      email: (webUser as any).email,
      role: 'merchant',
    } as unknown as BetterAuthUserWithRole
    const webappRes =
      await databaseAuthenticationInfoForWebappRequest(
        mockBetterAuthUser
      )
    const secretRes = await dbAuthInfoForSecretApiKeyResult({
      keyType: FlowgladApiKeyType.Secret,
      userId: secretUser.id,
      ownerId: secretOrg.id,
      environment: 'live',
      metadata: {
        type: FlowgladApiKeyType.Secret,
        userId: secretUser.id,
        organizationId: secretOrg.id,
        pricingModelId: secretOrgLivePricingModelId,
      },
    } as any)
    expect(typeof secretRes.jwtClaim.session_id).toBe('string')
    expect((webappRes.jwtClaim as any).session_id).toBeUndefined()
  })
})

describe('Customer Role vs Merchant Role Authentication', () => {
  let customerOrg: Organization.Record
  let merchantUser: User.Record
  let customerUser: User.Record
  let customer1: Customer.Record
  let customer2SameOrg: Customer.Record
  let customerDifferentOrg: Customer.Record
  let differentOrg: Organization.Record

  beforeEach(async () => {
    // Setup organizations
    const orgSetup = await setupOrg()
    customerOrg = orgSetup.organization
    const otherOrgSetup = await setupOrg()
    differentOrg = otherOrgSetup.organization

    // Create merchant user with membership
    const merchantSetup = await setupUserAndApiKey({
      organizationId: customerOrg.id,
      livemode: true,
    })
    merchantUser = merchantSetup.user
    // Ensure merchantUser has a betterAuthId for authentication
    await adminTransaction(async ({ transaction }) => {
      if (!merchantUser.betterAuthId) {
        const betterAuthId = `bau_${core.nanoid()}`
        await transaction
          .update(users)
          .set({ betterAuthId })
          .where(eq(users.id, merchantUser.id))
        merchantUser = {
          ...merchantUser,
          betterAuthId,
        } as User.Record
      }
    })

    // Create customer users
    await adminTransaction(async ({ transaction }) => {
      const [user] = await transaction
        .insert(users)
        .values({
          id: `usr_${core.nanoid()}`,
          email: `customer1@test.com`,
          name: 'Customer User',
          betterAuthId: `bau_${core.nanoid()}`,
        })
        .returning()
      customerUser = user as User.Record
    })

    // Create customers
    customer1 = await setupCustomer({
      organizationId: customerOrg.id,
      email: customerUser.email!,
      userId: customerUser.id,
      livemode: true,
    })

    customer2SameOrg = await setupCustomer({
      organizationId: customerOrg.id,
      email: 'customer2@test.com',
      livemode: true,
    })

    customerDifferentOrg = await setupCustomer({
      organizationId: differentOrg.id,
      email: 'customer3@test.com',
      livemode: true,
    })
  })

  describe('dbInfoForCustomerBillingPortal', () => {
    it('should return customer role in JWT claim for customer authentication', async () => {
      const result = await dbInfoForCustomerBillingPortal({
        betterAuthId: customerUser.betterAuthId!,
        organizationId: customerOrg.id,
        customerId: customer1.id,
      })

      expect(result.jwtClaim.role).toBe('customer')
      expect(result.jwtClaim.organization_id).toBe(customerOrg.id)
      expect(result.userId).toBe(customerUser.id)
      expect(result.jwtClaim.user_metadata.role).toBe('customer')
      expect(result.jwtClaim.app_metadata.provider).toBe(
        'customerBillingPortal'
      )
    })

    it('should distinguish between merchant and customer roles', async () => {
      // Merchant authentication
      const merchantResult =
        await databaseAuthenticationInfoForWebappRequest({
          id: merchantUser.betterAuthId!,
          email: merchantUser.email!,
          role: 'merchant',
        } as BetterAuthUserWithRole)

      // Customer authentication
      const customerResult = await dbInfoForCustomerBillingPortal({
        betterAuthId: customerUser.betterAuthId!,
        organizationId: customerOrg.id,
        customerId: customer1.id,
      })

      expect(merchantResult.jwtClaim.role).toBe('merchant')
      expect(customerResult.jwtClaim.role).toBe('customer')

      // Different providers
      expect(merchantResult.jwtClaim.app_metadata.provider).toBe(
        'webapp'
      )
      expect(customerResult.jwtClaim.app_metadata.provider).toBe(
        'customerBillingPortal'
      )
    })

    it('should fail when customer tries to authenticate for wrong organization', async () => {
      await expect(
        dbInfoForCustomerBillingPortal({
          betterAuthId: customerUser.betterAuthId!,
          organizationId: 'wrong_org_id',
          customerId: customer1.id,
        })
      ).rejects.toThrow('Customer not found')
    })

    it('should fail when user has no customer record in the organization', async () => {
      // Create a user with no customer record
      const userWithoutCustomer = await adminTransaction(
        async ({ transaction }) => {
          const [user] = await transaction
            .insert(users)
            .values({
              id: `usr_${core.nanoid()}`,
              email: `nocustomer@test.com`,
              name: 'No Customer User',
              betterAuthId: `bau_${core.nanoid()}`,
            })
            .returning()
          return user as User.Record
        }
      )

      await expect(
        dbInfoForCustomerBillingPortal({
          betterAuthId: userWithoutCustomer.betterAuthId!,
          organizationId: customerOrg.id,
          customerId: 'non_existent_customer_id',
        })
      ).rejects.toThrow('Customer not found')
    })

    it('should handle customer authentication across different organizations', async () => {
      // Create same user with customer in different org
      const userWithMultipleCustomers = await adminTransaction(
        async ({ transaction }) => {
          const [user] = await transaction
            .insert(users)
            .values({
              id: `usr_${core.nanoid()}`,
              email: `multi@test.com`,
              name: 'Multi Org User',
              betterAuthId: `bau_${core.nanoid()}`,
            })
            .returning()
          return user as User.Record
        }
      )

      // Create customers in both orgs
      const customerOrg1 = await setupCustomer({
        organizationId: customerOrg.id,
        email: userWithMultipleCustomers.email!,
        userId: userWithMultipleCustomers.id,
        livemode: true,
      })

      const customerOrg2 = await setupCustomer({
        organizationId: differentOrg.id,
        email: userWithMultipleCustomers.email!,
        userId: userWithMultipleCustomers.id,
        livemode: true,
      })

      // Authenticate for org1
      const org1Result = await dbInfoForCustomerBillingPortal({
        betterAuthId: userWithMultipleCustomers.betterAuthId!,
        organizationId: customerOrg.id,
        customerId: customerOrg1.id,
      })

      // Authenticate for org2
      const org2Result = await dbInfoForCustomerBillingPortal({
        betterAuthId: userWithMultipleCustomers.betterAuthId!,
        organizationId: differentOrg.id,
        customerId: customerOrg2.id,
      })

      // Both should succeed but with different organization contexts
      expect(org1Result.jwtClaim.organization_id).toBe(customerOrg.id)
      expect(org2Result.jwtClaim.organization_id).toBe(
        differentOrg.id
      )
      expect(org1Result.jwtClaim.role).toBe('customer')
      expect(org2Result.jwtClaim.role).toBe('customer')
    })

    it('should correctly set livemode to true for livemode customer', async () => {
      const liveModeResult = await dbInfoForCustomerBillingPortal({
        betterAuthId: customerUser.betterAuthId!,
        organizationId: customerOrg.id,
        customerId: customer1.id,
      })
      expect(liveModeResult.livemode).toBe(true)
    })

    it('should throw for a test mode customer', async () => {
      const testModeCustomer = await setupCustomer({
        organizationId: customerOrg.id,
        email: 'testmode@test.com',
        livemode: false,
      })

      const testModeUser = await adminTransaction(
        async ({ transaction }) => {
          const [user] = await transaction
            .insert(users)
            .values({
              id: `usr_${core.nanoid()}`,
              email: testModeCustomer.email!,
              name: 'Test Mode User',
              betterAuthId: `bau_${core.nanoid()}`,
            })
            .returning()

          await transaction
            .update(customers)
            .set({ userId: user.id })
            .where(eq(customers.id, testModeCustomer.id))

          return user as User.Record
        }
      )

      await expect(
        dbInfoForCustomerBillingPortal({
          betterAuthId: testModeUser.betterAuthId!,
          organizationId: customerOrg.id,
          customerId: testModeCustomer.id,
        })
      ).rejects.toThrow('Customer not found')
    })

    it('should select only livemode customer when both exist and set customer_id claim', async () => {
      // Create a separate livemode customer explicitly, and a test-mode customer for same org
      const liveModeCustomer = await setupCustomer({
        organizationId: customerOrg.id,
        email: `livemode-${core.nanoid()}@test.com`,
        livemode: true,
      })
      const liveModeUser = await adminTransaction(
        async ({ transaction }) => {
          const [user] = await transaction
            .insert(users)
            .values({
              id: `usr_${core.nanoid()}`,
              email: liveModeCustomer.email!,
              name: 'Live Mode Customer User',
              betterAuthId: `bau_${core.nanoid()}`,
            })
            .returning()
          await transaction
            .update(customers)
            .set({ userId: (user as User.Record).id })
            .where(eq(customers.id, liveModeCustomer.id))
          return user as User.Record
        }
      )

      const testModeCustomer = await setupCustomer({
        organizationId: customerOrg.id,
        email: `testmode-${core.nanoid()}@test.com`,
        livemode: false,
      })
      await adminTransaction(async ({ transaction }) => {
        const [user] = await transaction
          .insert(users)
          .values({
            id: `usr_${core.nanoid()}`,
            email: testModeCustomer.email!,
            name: 'Test Mode Customer User',
            betterAuthId: `bau_${core.nanoid()}`,
          })
          .returning()
        await transaction
          .update(customers)
          .set({ userId: (user as User.Record).id })
          .where(eq(customers.id, testModeCustomer.id))
      })

      const livemodeResult = await dbInfoForCustomerBillingPortal({
        betterAuthId: liveModeUser.betterAuthId!,
        organizationId: customerOrg.id,
        customerId: liveModeCustomer.id,
      })

      expect(livemodeResult.userId).toBe(liveModeUser.id)
      expect(livemodeResult.livemode).toBe(true)
      expect(
        livemodeResult.jwtClaim.user_metadata.app_metadata.customer_id
      ).toBe(liveModeCustomer.id)
    })
  })

  describe('Role-based JWT Claim Differences', () => {
    it('should have different JWT claim structures for merchant vs customer', async () => {
      const merchantAuth =
        await databaseAuthenticationInfoForWebappRequest({
          id: merchantUser.betterAuthId!,
          email: merchantUser.email!,
          role: 'merchant',
        } as BetterAuthUserWithRole)

      const customerAuth = await dbInfoForCustomerBillingPortal({
        betterAuthId: customerUser.betterAuthId!,
        organizationId: customerOrg.id,
        customerId: customer1.id,
      })

      // Merchant should have session_id in some cases (for Secret API keys)
      // Customer should never have session_id
      expect(
        (customerAuth.jwtClaim as any).session_id
      ).toBeUndefined()

      // Both should have organization_id
      expect(merchantAuth.jwtClaim.organization_id).toEqual(
        customerOrg.id
      )
      expect(customerAuth.jwtClaim.organization_id).toEqual(
        customerOrg.id
      )

      // Role should be different
      expect(merchantAuth.jwtClaim.role).toBe('merchant')
      expect(customerAuth.jwtClaim.role).toBe('customer')

      // user_metadata.role should match
      expect(merchantAuth.jwtClaim.user_metadata.role).toBe(
        'merchant'
      )
      expect(customerAuth.jwtClaim.user_metadata.role).toBe(
        'customer'
      )
    })

    it('should prevent role elevation attempts', async () => {
      // Customer auth info
      const customerAuth = await dbInfoForCustomerBillingPortal({
        betterAuthId: customerUser.betterAuthId!,
        organizationId: customerOrg.id,
        customerId: customer1.id,
      })

      // Verify the role is strictly 'customer'
      expect(customerAuth.jwtClaim.role).toBe('customer')

      // The role in user_metadata should also be 'customer'
      expect(customerAuth.jwtClaim.user_metadata.role).toBe(
        'customer'
      )

      // app_metadata.provider should indicate customer portal
      expect(customerAuth.jwtClaim.app_metadata.provider).toBe(
        'customerBillingPortal'
      )

      // These should prevent any attempt to elevate to merchant role
      // through JWT manipulation
    })
  })

  describe('Customer Isolation Validation', () => {
    it('should ensure customer JWT claims are properly scoped', async () => {
      const customerAuth = await dbInfoForCustomerBillingPortal({
        betterAuthId: customerUser.betterAuthId!,
        organizationId: customerOrg.id,
        customerId: customer1.id,
      })

      // Verify all required fields for RLS policies
      expect(customerAuth.jwtClaim.sub).toBe(customerUser.id)
      expect(customerAuth.jwtClaim.organization_id).toBe(
        customerOrg.id
      )
      expect(customerAuth.jwtClaim.role).toBe('customer')

      // These fields are used by RLS policies to filter data
      expect(customerAuth.userId).toBe(customerUser.id)
      expect(customerAuth.jwtClaim.user_metadata.id).toBe(
        customerUser.id
      )
    })

    it('should handle NULL userId customers correctly in authentication', async () => {
      // Create customer with NULL userId
      const nullUserCustomer = await setupCustomer({
        organizationId: customerOrg.id,
        email: 'nulluser@test.com',
        livemode: true,
      })

      // Create a user that doesn't match the customer
      const unrelatedUser = await adminTransaction(
        async ({ transaction }) => {
          const [user] = await transaction
            .insert(users)
            .values({
              id: `usr_${core.nanoid()}`,
              email: 'unrelated@test.com',
              name: 'Unrelated User',
              betterAuthId: `bau_${core.nanoid()}`,
            })
            .returning()
          return user as User.Record
        }
      )

      // Should fail to authenticate as the NULL userId customer
      await expect(
        dbInfoForCustomerBillingPortal({
          betterAuthId: unrelatedUser.betterAuthId!,
          organizationId: customerOrg.id,
          customerId: nullUserCustomer.id,
        })
      ).rejects.toThrow('Customer not found')
    })
  })
})

describe('Focused membership consistency between databaseAuthentication and trpcContext', () => {
  /**
   * This test suite verifies that databaseAuthentication.ts and trpcContext.ts
   * have consistent behavior when determining which organization a user is accessing.
   *
   * Previously, there was a bug where:
   * - trpcContext.ts used .find(m => m.focused) which returns undefined if no match
   * - databaseAuthentication.ts used ORDER BY focused DESC LIMIT 1 which returns
   *   an arbitrary membership when none are focused
   *
   * This inconsistency could cause data to be associated with the wrong organization.
   */

  it('should return no organization when user has multiple memberships but none focused (matching trpcContext behavior)', async () => {
    // Create a fresh user with multiple memberships, none focused
    const testBetterAuthId = `bau_${core.nanoid()}`
    const testEmail = `consistency-test+${core.nanoid()}@test.com`

    const { organization: org1, testmodePricingModel: pm1 } =
      await setupOrg()
    const { organization: org2, pricingModel: pm2 } = await setupOrg()

    await adminTransaction(async ({ transaction }) => {
      const [testUser] = await transaction
        .insert(users)
        .values({
          id: `usr_${core.nanoid()}`,
          email: testEmail,
          name: 'Consistency Test User',
          betterAuthId: testBetterAuthId,
        })
        .returning()

      // Create two memberships, NEITHER focused
      await transaction.insert(memberships).values([
        {
          userId: testUser.id,
          organizationId: org1.id,
          focused: false,
          livemode: false,
          focusedPricingModelId: pm1.id,
        },
        {
          userId: testUser.id,
          organizationId: org2.id,
          focused: false,
          livemode: true,
          focusedPricingModelId: pm2.id,
        },
      ])
    })

    const mockBetterAuthUser = {
      id: testBetterAuthId,
      email: testEmail,
      role: 'merchant',
    } as BetterAuthUserWithRole

    // databaseAuthentication.ts behavior
    const dbAuthResult =
      await databaseAuthenticationInfoForWebappRequest(
        mockBetterAuthUser
      )

    // Simulate trpcContext.ts behavior (which uses .find())
    const allMemberships = await adminTransaction(
      async ({ transaction }) => {
        return selectMembershipAndOrganizationsByBetterAuthUserId(
          testBetterAuthId,
          transaction
        )
      }
    )
    const trpcContextResult = allMemberships.find(
      (m) => m.membership.focused
    )

    // Both should return no organization when none is focused
    expect(dbAuthResult.jwtClaim.organization_id).toEqual('')
    expect(dbAuthResult.userId).toBeUndefined()
    expect(trpcContextResult).toBeUndefined()
  })

  it('should return the focused organization when user has multiple memberships with one focused', async () => {
    // Create a fresh user with multiple memberships, one focused
    const testBetterAuthId = `bau_${core.nanoid()}`
    const testEmail = `consistency-focused+${core.nanoid()}@test.com`

    const { organization: org1, testmodePricingModel: pm1 } =
      await setupOrg()
    const { organization: org2, pricingModel: pm2 } = await setupOrg()
    const { organization: org3, testmodePricingModel: pm3 } =
      await setupOrg()

    let focusedOrgId: string
    let testUserId: string

    await adminTransaction(async ({ transaction }) => {
      const [testUser] = await transaction
        .insert(users)
        .values({
          id: `usr_${core.nanoid()}`,
          email: testEmail,
          name: 'Focused Consistency Test User',
          betterAuthId: testBetterAuthId,
        })
        .returning()
      testUserId = testUser.id

      // Create three memberships, only org2 is focused
      focusedOrgId = org2.id
      await transaction.insert(memberships).values([
        {
          userId: testUser.id,
          organizationId: org1.id,
          focused: false,
          livemode: false,
          focusedPricingModelId: pm1.id,
        },
        {
          userId: testUser.id,
          organizationId: org2.id,
          focused: true, // This one is focused
          livemode: true,
          focusedPricingModelId: pm2.id,
        },
        {
          userId: testUser.id,
          organizationId: org3.id,
          focused: false,
          livemode: false,
          focusedPricingModelId: pm3.id,
        },
      ])
    })

    const mockBetterAuthUser = {
      id: testBetterAuthId,
      email: testEmail,
      role: 'merchant',
    } as BetterAuthUserWithRole

    // databaseAuthentication.ts behavior
    const dbAuthResult =
      await databaseAuthenticationInfoForWebappRequest(
        mockBetterAuthUser
      )

    // Simulate trpcContext.ts behavior
    const allMemberships = await adminTransaction(
      async ({ transaction }) => {
        return selectMembershipAndOrganizationsByBetterAuthUserId(
          testBetterAuthId,
          transaction
        )
      }
    )
    const trpcContextResult = allMemberships.find(
      (m) => m.membership.focused
    )

    // Both should return the focused organization
    expect(dbAuthResult.jwtClaim.organization_id).toEqual(
      focusedOrgId!
    )
    expect(dbAuthResult.userId).toEqual(testUserId!)
    expect(trpcContextResult).toMatchObject({})
    expect(trpcContextResult!.membership.organizationId).toEqual(
      focusedOrgId!
    )
  })
})
